from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class Paper(BaseModel):
    """Normalized paper shape shared by search results (and later, the library and PDF uploads)."""

    paper_id: str
    title: str
    authors: list[str]
    year: int | None = None
    abstract: str | None = None  # Semantic Scholar often omits abstracts for licensing reasons
    url: str | None = None  # best available link: open-access PDF > DOI > S2 page
    pdf_url: str | None = None  # open-access PDF, if any


class LibraryPaper(Paper):
    """A saved paper as returned by the library API (built directly from a SavedPaper row)."""

    model_config = ConfigDict(from_attributes=True)

    source: str
    saved_at: datetime

    @field_validator("saved_at")
    @classmethod
    def _assume_utc(cls, v: datetime) -> datetime:
        # SQLite drops tzinfo on storage; values are written as UTC, so reattach it.
        # Without this the JSON has no "Z" and browsers would parse it as local time.
        return v if v.tzinfo else v.replace(tzinfo=UTC)


class SearchResponse(BaseModel):
    query: str
    total: int
    offset: int
    papers: list[Paper]
