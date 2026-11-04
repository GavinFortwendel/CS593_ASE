"""Unit tests for backend/services/paper_text.py (the PDF host is mocked)."""

import httpx
import pytest

from backend.models import SavedPaper
from backend.services import paper_text
from backend.services.paper_text import UPLOAD_HINT, FullTextUnavailable, ensure_full_text
from pdf_factory import PAPER_PAGE_1, make_pdf

PDF_URL = "https://arxiv.org/pdf/1706.03762.pdf"


@pytest.fixture
def paper(db) -> SavedPaper:
    row = SavedPaper(paper_id="p1", title="T", authors=[], pdf_url=PDF_URL, full_text=None)
    db.add(row)
    db.commit()
    return row


def test_existing_text_is_returned_without_downloading(db, paper, pdf_host):
    paper.full_text = "already extracted"
    assert ensure_full_text(paper, db) == "already extracted"
    assert pdf_host.requests == []


def test_paper_without_pdf_url_is_unavailable(db, paper, pdf_host):
    paper.pdf_url = None
    with pytest.raises(FullTextUnavailable) as info:
        ensure_full_text(paper, db)
    assert str(info.value) == f"This paper has no open-access PDF. {UPLOAD_HINT}"
    assert pdf_host.requests == []


def test_downloaded_text_is_cached_in_the_database(db, paper, pdf_host, get_row):
    pdf_host.respond(httpx.Response(200, content=make_pdf([PAPER_PAGE_1])))

    text = ensure_full_text(paper, db)

    assert "Recurrent neural networks have been firmly established" in text
    assert get_row("p1").full_text == text  # committed, not just set on the object
    # Only the text is taken from the PDF; the Semantic Scholar metadata is kept.
    assert get_row("p1").title == "T"


def test_download_uses_browser_headers(db, paper, pdf_host):
    pdf_host.respond(httpx.Response(200, content=make_pdf([PAPER_PAGE_1])))
    ensure_full_text(paper, db)
    request = pdf_host.requests[0]
    assert request.headers["user-agent"].startswith("Mozilla/5.0")
    assert request.headers["accept"] == "application/pdf,*/*;q=0.8"


def test_download_follows_redirects(db, paper, pdf_host):
    pdf_host.respond(
        httpx.Response(302, headers={"Location": "https://cdn.example/final.pdf"}),
        httpx.Response(200, content=make_pdf([PAPER_PAGE_1])),
    )
    ensure_full_text(paper, db)
    assert [str(r.url) for r in pdf_host.requests] == [PDF_URL, "https://cdn.example/final.pdf"]


@pytest.mark.parametrize(
    "response, message",
    [
        (httpx.Response(404), f"The PDF host returned HTTP 404. {UPLOAD_HINT}"),
        (
            httpx.Response(200, content=b"<!DOCTYPE html><html>Landing page</html>"),
            f"The open-access link points to a web page, not a PDF file. {UPLOAD_HINT}",
        ),
        (
            lambda req: httpx.ConnectError("refused", request=req),
            f"Could not download the open-access PDF. {UPLOAD_HINT}",
        ),
        (
            lambda req: httpx.ReadTimeout("slow", request=req),
            f"Could not download the open-access PDF. {UPLOAD_HINT}",
        ),
    ],
    ids=["http-404", "html-landing-page", "connect-error", "timeout"],
)
def test_download_failures_are_reported_and_not_cached(db, paper, pdf_host, get_row, response, message):
    pdf_host.respond(response)
    with pytest.raises(FullTextUnavailable) as info:
        ensure_full_text(paper, db)
    assert str(info.value) == message
    assert get_row("p1").full_text is None


def test_oversized_download_is_rejected(db, paper, pdf_host, monkeypatch):
    monkeypatch.setattr(paper_text, "MAX_UPLOAD_BYTES", 1024 * 1024)
    pdf_host.respond(httpx.Response(200, content=b"%PDF-" + b"0" * (1024 * 1024)))
    with pytest.raises(FullTextUnavailable) as info:
        ensure_full_text(paper, db)
    assert str(info.value) == f"The open-access PDF is larger than 1 MB. {UPLOAD_HINT}"


def test_unreadable_downloaded_pdf_is_reported_with_hint(db, paper, pdf_host, get_row):
    pdf_host.respond(httpx.Response(200, content=make_pdf([[]])))  # no text layer
    with pytest.raises(FullTextUnavailable) as info:
        ensure_full_text(paper, db)
    assert str(info.value) == (
        f"No extractable text found. Scanned (image-only) PDFs aren't supported. {UPLOAD_HINT}"
    )
    assert get_row("p1").full_text is None
