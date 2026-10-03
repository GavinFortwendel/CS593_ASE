from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20_000)


class SummaryResponse(BaseModel):
    summary: str


class QARequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # Earlier turns of the conversation, kept by the frontend (chats aren't stored server-side).
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)

    @field_validator("question")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Question must not be empty")
        return v


class QAResponse(BaseModel):
    answer: str


class SearchResponse(BaseModel):
    query: str
    total: int
    offset: int
    papers: list[Paper]
