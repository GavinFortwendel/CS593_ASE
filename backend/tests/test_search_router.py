"""API tests for GET /api/search (Semantic Scholar is mocked)."""

import httpx
import pytest

from test_semantic_scholar import FULL_ITEM


def test_search_returns_normalized_papers(client, s2):
    s2.respond(httpx.Response(200, json={"total": 1234, "offset": 0, "data": [FULL_ITEM]}))

    response = client.get("/api/search", params={"q": "attention"})

    assert response.status_code == 200
    assert response.json() == {
        "query": "attention",
        "total": 1234,
        "offset": 0,
        "papers": [
            {
                "paper_id": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
                "title": "Attention Is All You Need",
                "authors": ["Ashish Vaswani", "Noam Shazeer"],
                "year": 2017,
                "abstract": "The dominant sequence transduction models are based on recurrent networks.",
                "url": "https://arxiv.org/pdf/1706.03762.pdf",
                "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
            }
        ],
    }


def test_search_uses_default_paging(client, s2):
    s2.respond(httpx.Response(200, json={"total": 0, "offset": 0}))
    client.get("/api/search", params={"q": "attention"})
    params = s2.requests[0].url.params
    assert (params["limit"], params["offset"]) == ("10", "0")


def test_search_forwards_paging(client, s2):
    s2.respond(httpx.Response(200, json={"total": 500, "offset": 40, "data": []}))
    response = client.get("/api/search", params={"q": "graph neural networks", "limit": 20, "offset": 40})
    assert response.status_code == 200
    assert response.json() == {"query": "graph neural networks", "total": 500, "offset": 40, "papers": []}
    params = s2.requests[0].url.params
    assert (params["query"], params["limit"], params["offset"]) == ("graph neural networks", "20", "40")


def test_search_accepts_the_largest_page_size(client, s2):
    s2.respond(httpx.Response(200, json={"total": 0, "offset": 0}))
    assert client.get("/api/search", params={"q": "x", "limit": 100}).status_code == 200


@pytest.mark.parametrize(
    "params",
    [
        {},  # q is required
        {"q": ""},
        {"q": "x", "limit": 0},
        {"q": "x", "limit": 101},
        {"q": "x", "offset": -1},
        {"q": "x", "limit": "ten"},
    ],
    ids=["missing-q", "empty-q", "limit-0", "limit-101", "negative-offset", "non-int-limit"],
)
def test_search_rejects_invalid_parameters_without_calling_the_api(client, s2, params):
    response = client.get("/api/search", params=params)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert s2.requests == []


def test_search_recovers_from_a_single_rate_limit(client, s2):
    s2.respond(httpx.Response(429), httpx.Response(200, json={"total": 1, "offset": 0, "data": [FULL_ITEM]}))
    response = client.get("/api/search", params={"q": "x"})
    assert response.status_code == 200
    assert len(response.json()["papers"]) == 1


def test_search_reports_persistent_rate_limit_as_503(client, s2):
    s2.respond(httpx.Response(429), httpx.Response(429), httpx.Response(429))

    response = client.get("/api/search", params={"q": "x"})

    assert response.status_code == 503
    assert response.json() == {"detail": "Paper search is rate-limited, try again shortly"}
    assert len(s2.requests) == 3


@pytest.mark.parametrize("upstream_status", [400, 404, 500, 502, 503])
def test_search_reports_other_upstream_errors_as_502(client, s2, upstream_status):
    s2.respond(httpx.Response(upstream_status))
    response = client.get("/api/search", params={"q": "x"})
    assert response.status_code == 502
    assert response.json() == {"detail": f"Paper search failed: Semantic Scholar returned {upstream_status}"}


def test_search_reports_timeout_as_504(client, s2):
    s2.respond(lambda req: httpx.ConnectTimeout("timed out", request=req))
    response = client.get("/api/search", params={"q": "x"})
    assert response.status_code == 504
    assert response.json() == {"detail": "Paper search timed out, try again"}


def test_search_reports_unreachable_api_as_502(client, s2):
    s2.respond(lambda req: httpx.ConnectError("Connection refused", request=req))
    response = client.get("/api/search", params={"q": "x"})
    assert response.status_code == 502
    assert response.json() == {"detail": "Paper search failed: Could not reach Semantic Scholar: Connection refused"}
