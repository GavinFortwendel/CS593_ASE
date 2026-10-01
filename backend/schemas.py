from pydantic import BaseModel


class Paper(BaseModel):
    """Normalized paper shape shared by search results (and later, the library and PDF uploads)."""

    paper_id: str
    title: str
    authors: list[str]
    year: int | None = None
    abstract: str | None = None  # Semantic Scholar often omits abstracts for licensing reasons
    url: str | None = None  # best available link: open-access PDF > DOI > S2 page
    pdf_url: str | None = None  # open-access PDF, if any


class SearchResponse(BaseModel):
    query: str
    total: int
    offset: int
    papers: list[Paper]
