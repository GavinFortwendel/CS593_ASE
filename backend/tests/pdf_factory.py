"""Builds small, real PDF files in memory for upload/extraction tests.

Hand-written instead of using a PDF library so the test suite needs no extra dependencies, and so
each test controls exactly which text and metadata the PDF contains.
"""

from datetime import datetime

from pypdf import PdfReader, PdfWriter
import io


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(
    pages: list[list[str]],
    *,
    title: str | None = None,
    author: str | None = None,
    creation_date: datetime | None = None,
) -> bytes:
    """Return PDF bytes with one text line per list entry on each page.

    An empty inner list gives a page with no text (like a scanned, image-only page).
    """
    objects: list[bytes] = []  # objects[i] is object number i + 1

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # placeholder, filled once the pages object number is known
    pages_obj = add(b"")
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_ids = []
    for lines in pages:
        ops = ["BT", "/F1 11 Tf", "14 TL", "72 760 Td"]
        for line in lines:
            ops.append(f"({_escape(line)}) Tj T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        content = add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page_ids.append(
            add(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (pages_obj, font, content)
            )
        )

    kids = b" ".join(b"%d 0 R" % p for p in page_ids)
    objects[catalog - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % pages_obj
    objects[pages_obj - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))

    info_entries = []
    if title is not None:
        info_entries.append(b"/Title (%s)" % _escape(title).encode("latin-1"))
    if author is not None:
        info_entries.append(b"/Author (%s)" % _escape(author).encode("latin-1"))
    if creation_date is not None:
        info_entries.append(b"/CreationDate (D:%s)" % creation_date.strftime("%Y%m%d%H%M%S").encode())
    info = add(b"<< %s >>" % b" ".join(info_entries)) if info_entries else None

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    trailer = b"/Size %d /Root %d 0 R" % (len(objects) + 1, catalog)
    if info:
        trailer += b" /Info %d 0 R" % info
    out += b"trailer\n<< %s >>\nstartxref\n%d\n%%%%EOF\n" % (trailer, xref_at)
    return bytes(out)


def encrypt_pdf(data: bytes, user_password: str) -> bytes:
    """Return an RC4-encrypted copy of `data`. An empty user password opens without prompting."""
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(data)))
    writer.encrypt(user_password=user_password, owner_password="owner-secret", algorithm="RC4-128")
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


# A realistic first page: arXiv banner, wrapped title, authors, affiliation, abstract, intro.
PAPER_PAGE_1 = [
    "arXiv:1706.03762v5 [cs.CL] 6 Dec 2017",
    "Attention Is All You Need for",
    "Sequence Transduction",
    "Ashish Vaswani, Noam Shazeer and Niki Parmar",
    "Google Brain",
    "Abstract",
    "The dominant sequence transduction models are based on complex recurrent or",
    "convolutional neural networks. We propose a new simple network architecture,",
    "the Transformer, based solely on attention mechanisms.",
    "1 Introduction",
    "Recurrent neural networks have been firmly established as state of the art approaches.",
]
PAPER_PAGE_2 = [
    "2 Results",
    "On the WMT 2014 English-to-German translation task the big transformer model",
    "establishes a new state-of-the-art BLEU score of 28.4.",
]
