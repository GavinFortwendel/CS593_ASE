from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class SavedPaper(Base):
    """A paper in the user's local library.

    Columns for later milestones (`source`, `full_text`) exist now because create_all
    can't add columns to an existing table.
    """

    __tablename__ = "papers"

    # Semantic Scholar paperId; uploaded PDFs will use "upload-<uuid>".
    paper_id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str] = mapped_column(String, default="semantic_scholar")
    title: Mapped[str] = mapped_column(String)
    authors: Mapped[list[str]] = mapped_column(JSON, default=list)
    year: Mapped[int | None]
    abstract: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None]
    pdf_url: Mapped[str | None]
    # Extracted paper text for summaries/Q&A. Never returned by list endpoints.
    full_text: Mapped[str | None] = mapped_column(Text)
    # Set in Python rather than SQLite's CURRENT_TIMESTAMP, which only has 1-second resolution
    # and would make "newest first" ordering ambiguous for papers saved in quick succession.
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
