import httpx
from fastapi import APIRouter, HTTPException, Query

from backend.schemas import SearchResponse
from backend.services.semantic_scholar import SemanticScholarError, search_papers

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Keywords or research topic"),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> SearchResponse:
    try:
        return await search_papers(q, limit=limit, offset=offset)
    except httpx.TimeoutException:
        raise HTTPException(504, "Paper search timed out, try again")
    except SemanticScholarError as e:
        if e.status_code == 429:
            raise HTTPException(503, "Paper search is rate-limited, try again shortly")
        raise HTTPException(502, f"Paper search failed: {e}")
