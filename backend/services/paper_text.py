"""Gets the full text of a library paper for summaries and Q&A.

Uploaded PDFs already have their text. Papers saved from Semantic Scholar don't, so their
open-access PDF is downloaded the first time it's needed and the extracted text is cached in the
row. This happens lazily, not when the paper is saved: saving stays instant and can't fail because
of a slow publisher site, and papers nobody summarizes are never downloaded.
"""

import httpx
from sqlalchemy.orm import Session

from backend.config import MAX_UPLOAD_BYTES
from backend.models import SavedPaper
from backend.services.pdf_extract import PdfExtractionError, extract_pdf

TIMEOUT_SECONDS = 30
# Some publisher hosts reject requests that don't look like they come from a browser.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*;q=0.8",
}
UPLOAD_HINT = "Download the PDF yourself and upload it in the Library tab instead."


class FullTextUnavailable(Exception):
    """The paper's text can't be obtained. The message is shown to the user."""


def ensure_full_text(record: SavedPaper, db: Session) -> str:
    if record.full_text:
        return record.full_text
    if not record.pdf_url:
        raise FullTextUnavailable(f"This paper has no open-access PDF. {UPLOAD_HINT}")

    data = _download_pdf(record.pdf_url)
    try:
        # Only the text is kept: the Semantic Scholar metadata is better than the PDF heuristics.
        text = extract_pdf(data, "remote.pdf").full_text
    except PdfExtractionError as exc:
        raise FullTextUnavailable(f"{exc} {UPLOAD_HINT}") from exc

    record.full_text = text
    db.commit()
    return text


def _download_pdf(url: str) -> bytes:
    try:
        with httpx.Client(
            timeout=TIMEOUT_SECONDS, follow_redirects=True, headers=HEADERS
        ) as client, client.stream("GET", url) as response:
            response.raise_for_status()
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise FullTextUnavailable(
                        f"The open-access PDF is larger than "
                        f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB. {UPLOAD_HINT}"
                    )
                chunks.append(chunk)
    except httpx.HTTPStatusError as exc:
        raise FullTextUnavailable(
            f"The PDF host returned HTTP {exc.response.status_code}. {UPLOAD_HINT}"
        ) from exc
    except httpx.HTTPError as exc:
        raise FullTextUnavailable(f"Could not download the open-access PDF. {UPLOAD_HINT}") from exc

    data = b"".join(chunks)
    # Many "open-access PDF" links actually lead to an HTML landing page.
    if not data.startswith(b"%PDF-"):
        raise FullTextUnavailable(
            f"The open-access link points to a web page, not a PDF file. {UPLOAD_HINT}"
        )
    return data
