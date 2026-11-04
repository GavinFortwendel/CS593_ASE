"""Unit tests for backend/services/semantic_scholar.py (Semantic Scholar is mocked)."""

import httpx
import pytest

from backend.schemas import Paper, SearchResponse
from backend.services import semantic_scholar
from backend.services.semantic_scholar import SemanticScholarError, _normalize, search_papers

FULL_ITEM = {
    "paperId": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
    "title": "Attention Is All You Need",
    "authors": [{"authorId": "40348417", "name": "Ashish Vaswani"}, {"authorId": "1846258", "name": "Noam Shazeer"}],
    "year": 2017,
    "abstract": "The dominant sequence transduction models are based on recurrent networks.",
    "url": "https://www.semanticscholar.org/paper/204e3073870fae3d05bcbc2f6a8e263d9b72e776",
    "externalIds": {"DOI": "10.48550/arXiv.1706.03762", "ArXiv": "1706.03762"},
    "openAccessPdf": {"url": "https://arxiv.org/pdf/1706.03762.pdf", "status": "GREEN"},
}


# --------------------------------------------------------------------------- _normalize


def test_normalize_maps_every_field():
    assert _normalize(FULL_ITEM) == Paper(
        paper_id="204e3073870fae3d05bcbc2f6a8e263d9b72e776",
        title="Attention Is All You Need",
        authors=["Ashish Vaswani", "Noam Shazeer"],
        year=2017,
        abstract="The dominant sequence transduction models are based on recurrent networks.",
        url="https://arxiv.org/pdf/1706.03762.pdf",  # open-access PDF wins
        pdf_url="https://arxiv.org/pdf/1706.03762.pdf",
    )


def test_normalize_prefers_doi_link_when_there_is_no_open_access_pdf():
    item = {**FULL_ITEM, "openAccessPdf": None}
    paper = _normalize(item)
    assert paper.url == "https://doi.org/10.48550/arXiv.1706.03762"
    assert paper.pdf_url is None


def test_normalize_falls_back_to_semantic_scholar_page():
    item = {**FULL_ITEM, "openAccessPdf": None, "externalIds": {"ArXiv": "1706.03762"}}
    assert _normalize(item).url == FULL_ITEM["url"]


def test_normalize_treats_empty_open_access_url_as_missing():
    # Semantic Scholar sometimes sends {"url": "", "status": null}.
    paper = _normalize({**FULL_ITEM, "openAccessPdf": {"url": "", "status": None}})
    assert paper.pdf_url is None
    assert paper.url == "https://doi.org/10.48550/arXiv.1706.03762"


def test_normalize_handles_sparse_records():
    paper = _normalize(
        {
            "paperId": "p1",
            "title": None,
            "authors": None,
            "year": None,
            "abstract": None,
            "url": None,
            "externalIds": None,
            "openAccessPdf": None,
        }
    )
    assert paper == Paper(paper_id="p1", title="Untitled", authors=[], year=None, abstract=None, url=None, pdf_url=None)


def test_normalize_drops_authors_without_names():
    item = {**FULL_ITEM, "authors": [{"authorId": "1", "name": "Ada Lovelace"}, {"authorId": "2", "name": None}, {"authorId": "3"}]}
    assert _normalize(item).authors == ["Ada Lovelace"]


# --------------------------------------------------------------------------- search_papers


async def test_search_papers_sends_query_paging_and_fields(s2):
    s2.respond(httpx.Response(200, json={"total": 1, "offset": 20, "data": [FULL_ITEM]}))

    result = await search_papers("transformers", limit=5, offset=20)

    request = s2.requests[0]
    assert request.url.host == "api.semanticscholar.org"
    assert request.url.path == "/graph/v1/paper/search"
    assert dict(request.url.params) == {
        "query": "transformers",
        "limit": "5",
        "offset": "20",
        "fields": "paperId,title,authors,year,abstract,url,externalIds,openAccessPdf",
    }
    assert "x-api-key" not in request.headers
    assert result == SearchResponse(query="transformers", total=1, offset=20, papers=[_normalize(FULL_ITEM)])


async def test_search_papers_sends_api_key_when_configured(s2, monkeypatch):
    monkeypatch.setattr(semantic_scholar, "SEMANTIC_SCHOLAR_API_KEY", "test-key")
    s2.respond(httpx.Response(200, json={"total": 0, "offset": 0}))

    await search_papers("x")

    assert s2.requests[0].headers["x-api-key"] == "test-key"


async def test_search_papers_skips_items_without_paper_id(s2):
    s2.respond(httpx.Response(200, json={"total": 2, "offset": 0, "data": [{"title": "No id"}, FULL_ITEM]}))
    result = await search_papers("x")
    assert [p.paper_id for p in result.papers] == [FULL_ITEM["paperId"]]


async def test_search_papers_with_no_results(s2):
    # Semantic Scholar omits "data" entirely when nothing matches.
    s2.respond(httpx.Response(200, json={"total": 0, "offset": 0}))
    assert await search_papers("zzzz") == SearchResponse(query="zzzz", total=0, offset=0, papers=[])


async def test_search_papers_defaults_missing_total_and_offset(s2):
    s2.respond(httpx.Response(200, json={"data": []}))
    result = await search_papers("x", offset=30)
    assert (result.total, result.offset) == (0, 30)


async def test_search_papers_retries_after_a_429(s2):
    s2.respond(httpx.Response(429), httpx.Response(200, json={"total": 1, "offset": 0, "data": [FULL_ITEM]}))

    result = await search_papers("x")

    assert len(s2.requests) == 2
    assert s2.sleeps == [1]
    assert result.total == 1


async def test_search_papers_gives_up_after_three_429s(s2):
    s2.respond(httpx.Response(429), httpx.Response(429), httpx.Response(429))

    with pytest.raises(SemanticScholarError) as info:
        await search_papers("x")

    assert info.value.status_code == 429
    assert str(info.value) == "Semantic Scholar returned 429"
    assert len(s2.requests) == 3
    assert s2.sleeps == [1, 2]


async def test_search_papers_does_not_retry_other_errors(s2):
    s2.respond(httpx.Response(500))
    with pytest.raises(SemanticScholarError) as info:
        await search_papers("x")
    assert info.value.status_code == 500
    assert len(s2.requests) == 1
    assert s2.sleeps == []


async def test_search_papers_lets_timeouts_propagate(s2):
    s2.respond(lambda req: httpx.ReadTimeout("timed out", request=req))
    with pytest.raises(httpx.TimeoutException):
        await search_papers("x")


async def test_search_papers_wraps_connection_errors(s2):
    s2.respond(lambda req: httpx.ConnectError("Name or service not known", request=req))
    with pytest.raises(SemanticScholarError) as info:
        await search_papers("x")
    assert info.value.status_code is None
    assert str(info.value) == "Could not reach Semantic Scholar: Name or service not known"
