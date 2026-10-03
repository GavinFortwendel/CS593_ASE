"""Text and metadata extraction for uploaded PDFs.

The metadata (title/authors/year/abstract) comes from best-effort heuristics: PDF layouts vary
too much for rules to be reliable, so these fields may be wrong or missing, and the UI tolerates
that. The full text is what matters, since summaries and Q&A are built on it.
"""

import io
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pypdf import PdfReader

# Keeps one pathological PDF from bloating the DB (~500k chars is a few hundred pages).
MAX_TEXT_CHARS = 500_000
MAX_ABSTRACT_CHARS = 3000
# Below this many non-whitespace characters we assume a scanned/image-only PDF.
MIN_TEXT_CHARS = 100

# Front-matter lines that are never the title (arXiv stamps, venue banners, permission notices,
# contact info, ...).
_NOT_TITLE = re.compile(
    r"arxiv|preprint|proceedings|conference|journal|copyright|©|licen[cs]e|permission|@|"
    r"https?://|www\.|doi",
    re.IGNORECASE,
)
# Titles wrap mid-phrase; a line ending in one of these words continues on the next line.
_TITLE_CONTINUES = re.compile(
    r"(?:\b(?:a|an|the|of|for|and|or|in|on|with|to|via|from|by|using|towards?)|[:\-–—])$",
    re.IGNORECASE,
)
# Affiliation/contact lines interleaved with author names.
_AFFILIATION = re.compile(
    r"@|universit|institut|department|dept\.|school|college|laborator|\blab\b|research|inc\.|"
    r"corporation|google|microsoft|meta\b|openai|deepmind|\b(?:ai|language|brain)$",
    re.IGNORECASE,
)
# Footnote markers that follow author names (∗ † ‡ § ¶, digits).
_MARKERS = re.compile(r"[\d*∗†‡§¶]+")
# Lowercase name particles ("Vincent van Gogh"); any other lowercase word means prose.
_NAME_PARTICLES = {"de", "van", "von", "der", "den", "la", "le", "di", "da", "du", "del", "bin"}
_INITIAL = re.compile(r"^[A-Z]\.(?:-?[A-Z]\.)*$")
# Venue banners and copyright lines carry the publication year.
_VENUE_LINE = re.compile(r"conference|proceedings|journal|symposium|workshop|©|copyright", re.I)
# arXiv IDs encode the first-submission year and month: arXiv:1706.03762 -> 2017.
_ARXIV_ID = re.compile(r"arXiv:(\d{2})(\d{2})\.\d{4,5}")
# Metadata titles that are really filenames or tool defaults.
_JUNK_META_TITLE = re.compile(r"microsoft word|untitled|\.(pdf|docx?|tex|dvi)\b", re.IGNORECASE)
_ABSTRACT = re.compile(
    r"\babstract\b[\s.:—–-]*(.+?)"
    r"(?=\n\s*(?:(?:1|I)\.?\s+)?introduction\b|\n\s*(?:keywords|index terms|ccs concepts)\b|\Z)",
    re.IGNORECASE | re.DOTALL,
)
# A 4-digit year that isn't part of a longer number (rules out arXiv IDs like 2012.12345).
_YEAR = re.compile(r"(?<![\d.])(19[5-9]\d|20\d\d)(?![\d.]\d)")


class PdfExtractionError(Exception):
    """The PDF can't be read or has no usable text. The message is shown to the user."""


@dataclass
class ExtractedPdf:
    title: str
    authors: list[str]
    year: int | None
    abstract: str | None
    full_text: str
    page_count: int


def extract_pdf(data: bytes, filename: str) -> ExtractedPdf:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfExtractionError("This PDF is password-protected.")
        pages = [_page_text(page) for page in reader.pages]
        meta = reader.metadata
    except PdfExtractionError:
        raise
    except Exception as exc:  # pypdf raises many exception types on malformed files
        raise PdfExtractionError(f"Could not read this PDF: {exc}") from exc

    full_text = "\n\n".join(p for p in pages if p)[:MAX_TEXT_CHARS]
    if len(re.sub(r"\s", "", full_text)) < MIN_TEXT_CHARS:
        raise PdfExtractionError(
            "No extractable text found. Scanned (image-only) PDFs aren't supported."
        )

    first_page = pages[0] if pages else ""
    lines = [ln for ln in first_page.splitlines() if ln]
    title, title_end = _title_from_text(lines)
    meta_title = _clean_meta_title(meta.title if meta else None)
    if meta_title:
        title = meta_title
    elif not title:
        title = Path(filename).stem or "Untitled PDF"

    authors = _authors_from_meta(meta.author if meta else None) or _authors_from_text(
        lines[title_end:]
    )

    abstract = _abstract("\n".join(pages[:2]))
    return ExtractedPdf(
        title=_sanitize(title),
        authors=[_sanitize(a) for a in authors],
        year=_year(first_page, meta),
        abstract=_sanitize(abstract) if abstract else None,
        full_text=_sanitize(full_text),
        page_count=len(pages),
    )


def _sanitize(text: str) -> str:
    """Make text safe to store as UTF-8.

    pypdf can return UTF-16 surrogate halves, e.g. math symbols like '𝐱' come out as the pair
    '\\ud835\\udc31', and SQLite's UTF-8 encoding rejects surrogates. A round trip through UTF-16
    joins valid pairs back into real characters and turns any lone surrogate into U+FFFD. This
    keeps math notation intact, where encoding straight to UTF-8 with 'replace' would turn every
    such symbol into '??'.
    """
    return text.encode("utf-16", "surrogatepass").decode("utf-16", "replace")


def _page_text(page) -> str:
    try:
        text = page.extract_text() or ""
    except Exception:  # one bad page shouldn't sink the whole upload
        return ""
    text = text.replace("\x00", "")
    lines = (re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines())
    return "\n".join(lines).strip()


def _clean_meta_title(title: str | None) -> str | None:
    title = (title or "").strip()
    if len(title.split()) < 3 or _JUNK_META_TITLE.search(title):
        return None
    return title


def _title_from_text(lines: list[str]) -> tuple[str | None, int]:
    """Return (title, index of the first line after it). The title is usually the first
    substantial line on page 1 that isn't a venue/arXiv banner."""
    for i, line in enumerate(lines[:15]):
        # Titles don't end in a period; notices and other sentences usually do.
        if len(line) < 10 or len(line.split()) < 2 or line.endswith(".") or _NOT_TITLE.search(line):
            continue
        title, end = line, i + 1
        while end < len(lines) and len(title) < 200:
            nxt = lines[end]
            if not (nxt[:1].islower() or _TITLE_CONTINUES.search(title)):
                break
            title = f"{title[:-1]}{nxt}" if title.endswith("-") else f"{title} {nxt}"
            end += 1
        return title, end
    return None, 0


def _authors_from_meta(author: str | None) -> list[str]:
    parts = re.split(r"\s*(?:,|;|\band\b|&)\s*", author or "")
    # Single-word values ("admin", "user") are usually the PDF tool's account name.
    return [p.strip() for p in parts if len(p.split()) >= 2]


def _authors_from_text(lines: list[str]) -> list[str]:
    """Collect names from the lines between the title and the abstract, skipping affiliation
    and email lines. Handles both "A, B and C" and space-separated "Ada Lovelace Alan Turing"."""
    names: list[str] = []
    for line in lines[:30]:
        if re.match(r"abstract\b", line, re.IGNORECASE):
            break
        if _AFFILIATION.search(line) or len(line.split()) < 2:
            continue
        # A lowercase word means we've run into prose; stop rather than harvest sentence words.
        if any(w[:1].islower() and w not in _NAME_PARTICLES for w in line.split()):
            break
        for chunk in re.split(r"\s*(?:,|;|\band\b|&|[∗*†‡§¶\d]+)\s*", line):
            names.extend(_split_names(chunk.split()))
    return names[:50]


def _split_names(words: list[str]) -> list[str]:
    """Group capitalized words into names: first name, any initials or particles, last name.
    Three-part names without an initial ("Juan Carlos Niebles") get split wrongly."""
    words = [w for w in (_MARKERS.sub("", w) for w in words) if w]
    if len(words) <= 3:
        return [" ".join(words)] if len(words) >= 2 else []
    names, i = [], 0
    while i + 1 < len(words):
        j = i + 1
        while j < len(words) - 1 and (_INITIAL.match(words[j]) or words[j] in _NAME_PARTICLES):
            j += 1
        names.append(" ".join(words[i : j + 1]))
        i = j + 1
    return names


def _year(first_page: str, meta) -> int | None:
    """Prefer explicit signals (venue banner, arXiv ID) over the bare years scattered through
    page 1, most of which are citation years."""
    this_year = datetime.now(UTC).year

    def years(text: str) -> list[int]:
        return [y for y in map(int, _YEAR.findall(text)) if y <= this_year]

    for line in first_page.splitlines():
        if _VENUE_LINE.search(line) and (found := years(line)):
            return found[0]
    if match := _ARXIV_ID.search(first_page):
        return 2000 + int(match.group(1))
    # Cited work predates the paper, so the latest year on page 1 is the best guess.
    if found := years(first_page):
        return max(found)
    try:
        created = meta.creation_date if meta else None
    except Exception:  # pypdf raises on malformed date strings
        return None
    return created.year if created else None


def _abstract(text: str) -> str | None:
    match = _ABSTRACT.search(text)
    if not match:
        return None
    body = re.sub(r"-\n(?=[a-z])", "", match.group(1))  # re-join hyphenated line breaks
    body = re.sub(r"\s+", " ", body).strip()
    if len(body) < 50:
        return None
    return body[:MAX_ABSTRACT_CHARS]
