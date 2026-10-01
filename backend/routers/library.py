from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import SavedPaper
from backend.schemas import LibraryPaper, Paper

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


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_paper(paper_id: str, db: Session = Depends(get_db)) -> None:
    record = db.get(SavedPaper, paper_id)
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not in library")
    db.delete(record)
    db.commit()
