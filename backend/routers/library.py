import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import MAX_UPLOAD_BYTES
from backend.database import get_db
from backend.models import SavedPaper
from backend.schemas import LibraryPaper, Paper
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


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_paper(paper_id: str, db: Session = Depends(get_db)) -> None:
    record = db.get(SavedPaper, paper_id)
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not in library")
    db.delete(record)
    db.commit()
