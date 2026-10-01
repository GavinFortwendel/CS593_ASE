import asyncio

import httpx

from backend.config import SEMANTIC_SCHOLAR_API_KEY
from backend.schemas import Paper, SearchResponse

BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
FIELDS = "paperId,title,authors,year,abstract,url,externalIds,openAccessPdf"
TIMEOUT_SECONDS = 10
RETRY_DELAYS_SECONDS = (1, 2)  # backoff between retries on 429


class SemanticScholarError(Exception):
    """Raised when Semantic Scholar returns an error or is unreachable."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _normalize(item: dict) -> Paper:
    authors = [a["name"] for a in item.get("authors") or [] if a.get("name")]

    open_access = item.get("openAccessPdf") or {}
    pdf_url = open_access.get("url") or None

    doi = (item.get("externalIds") or {}).get("DOI")
    doi_url = f"https://doi.org/{doi}" if doi else None

    return Paper(
        paper_id=item["paperId"],
        title=item.get("title") or "Untitled",
        authors=authors,
        year=item.get("year"),
        abstract=item.get("abstract"),
        url=pdf_url or doi_url or item.get("url"),
        pdf_url=pdf_url,
    )


async def search_papers(query: str, limit: int = 10, offset: int = 0) -> SearchResponse:
    params = {"query": query, "limit": limit, "offset": offset, "fields": FIELDS}
    headers = {"x-api-key": SEMANTIC_SCHOLAR_API_KEY} if SEMANTIC_SCHOLAR_API_KEY else {}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            # The unauthenticated pool 429s often; a couple of short retries smooths that over.
            for delay in RETRY_DELAYS_SECONDS:
                response = await client.get(BASE_URL, params=params, headers=headers)
                if response.status_code != 429:
                    break
                await asyncio.sleep(delay)
            else:
                response = await client.get(BASE_URL, params=params, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise SemanticScholarError(
            f"Semantic Scholar returned {e.response.status_code}", e.response.status_code
        ) from e
    except httpx.TimeoutException:
        raise  # let the router map this to 504
    except httpx.RequestError as e:
        raise SemanticScholarError(f"Could not reach Semantic Scholar: {e}") from e

    data = response.json()
    papers = [_normalize(item) for item in data.get("data") or [] if item.get("paperId")]
    return SearchResponse(
        query=query,
        total=data.get("total", 0),
        offset=data.get("offset", offset),
        papers=papers,
    )
