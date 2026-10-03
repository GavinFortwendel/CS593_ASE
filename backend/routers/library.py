import logging
from collections.abc import Callable
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import MAX_UPLOAD_BYTES
from backend.database import get_db
from backend.models import SavedPaper
from backend.schemas import LibraryPaper, Paper, QAResponse, QARequest, SummaryResponse
from backend.services import llm
from backend.services.llm import LLMError
from backend.services.paper_text import FullTextUnavailable, ensure_full_text
from backend.services.pdf_extract import PdfExtractionError, extract_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/library", tags=["library"])


@router.get("", response_model=list[LibraryPaper])
def list_library(db: Session = Depends(get_db)) -> list[SavedPaper]:
    return list(db.scalars(select(SavedPaper).order_by(SavedPaper.saved_at.desc())))


@router.post("", response_model=LibraryPaper, status_code=status.HTTP_201_CREATED)
def save_paper(paper: Paper, response: Response, db: Session = Depends(get_db)) -> SavedPaper:
    # Idempotent: saving an already-saved paper returns the existing row instead of erroring.
    existing = db.get(SavedPaper, paper.paper_id)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing

    # Snapshot the metadata so the library doesn't depend on Semantic Scholar later.
    record = SavedPaper(**paper.model_dump())
    db.add(record)
    db.commit()
    return record


@router.post("/upload", response_model=LibraryPaper, status_code=status.HTTP_201_CREATED)
def upload_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)) -> SavedPaper:
    # Sync endpoint so pypdf's CPU-bound parsing runs in FastAPI's threadpool, not the event loop.
    # Read one byte past the limit to detect oversized files without loading all of them.
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"PDF is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    # Check the magic bytes too: the content type is just whatever the client claims.
    if file.content_type != "application/pdf" or not data.startswith(b"%PDF-"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File must be a PDF")

    try:
        pdf = extract_pdf(data, file.filename or "upload.pdf")
        # Only the extracted text is stored, not the PDF itself: summaries and Q&A need only the
        # text, and keeping the binaries would mean managing files on disk plus a route to serve
        # them.
        record = SavedPaper(
            paper_id=f"upload-{uuid4()}",
            source="upload",
            title=pdf.title,
            authors=pdf.authors,
            year=pdf.year,
            abstract=pdf.abstract,
            url=None,
            pdf_url=None,
            full_text=pdf.full_text,
        )
        db.add(record)
        db.commit()
    except PdfExtractionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except Exception as exc:
        # Safety net for anything unanticipated in parsing or saving (pypdf can fail in many ways
        # on malformed files, and odd extracted text has broken the insert before). An unhandled
        # error becomes a 500 without CORS headers, which the browser reports as a network
        # failure ("Cannot reach the server"), not a readable error.
        db.rollback()
        logger.exception("Unexpected error processing upload %r", file.filename)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Could not process this PDF. It may be malformed or use an unsupported format.",
        ) from exc
    return record


def _load_paper(paper_id: str, db: Session) -> tuple[SavedPaper, str]:
    """Returns the library paper and its full text, fetching the open-access PDF if needed."""
    record = db.get(SavedPaper, paper_id)
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not in library")
    try:
        return record, ensure_full_text(record, db)
    except FullTextUnavailable as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


def _run_llm(fn: Callable[[], str], paper_id: str) -> str:
    try:
        return fn()
    except LLMError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    except Exception as exc:
        # Same reason as in upload_pdf: a raw 500 has no CORS headers and the browser would
        # report it as "Cannot reach the server".
        logger.exception("Unexpected LLM error for paper %r", paper_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed unexpectedly.") from exc


# The LLM endpoints are sync so the blocking OpenAI and PDF-download calls run in the threadpool.
@router.post("/{paper_id}/summarize", response_model=SummaryResponse)
def summarize_paper(paper_id: str, db: Session = Depends(get_db)) -> SummaryResponse:
    record, text = _load_paper(paper_id, db)
    return SummaryResponse(summary=_run_llm(lambda: llm.summarize(record.title, text), paper_id))


@router.post("/{paper_id}/qa", response_model=QAResponse)
def ask_paper(paper_id: str, body: QARequest, db: Session = Depends(get_db)) -> QAResponse:
    record, text = _load_paper(paper_id, db)
    answer = _run_llm(lambda: llm.answer(record.title, text, body.question, body.history), paper_id)
    return QAResponse(answer=answer)


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_paper(paper_id: str, db: Session = Depends(get_db)) -> None:
    record = db.get(SavedPaper, paper_id)
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not in library")
    db.delete(record)
    db.commit()
