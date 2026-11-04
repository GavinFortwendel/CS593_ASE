"""Unit tests for backend/services/pdf_extract.py.

Metadata is best-effort by design, so these tests cover clear-cut layouts and the behavior the
module documents, not every heuristic edge case. Full-text extraction and error handling are
tested strictly, since summaries and Q&A depend on them.
"""

from datetime import UTC, datetime

import pytest

from backend.services import pdf_extract
from backend.services.pdf_extract import (
    PdfExtractionError,
    _authors_from_meta,
    _authors_from_text,
    _page_text,
    _sanitize,
    _split_names,
    _title_from_text,
    _year,
    extract_pdf,
)
from pdf_factory import PAPER_PAGE_1, PAPER_PAGE_2, encrypt_pdf, make_pdf

FILLER = ["Body text that is long enough to count as real extractable content for the paper."] * 3


# --------------------------------------------------------------------------- full documents


def test_extracts_text_and_metadata_from_a_paper():
    pdf = extract_pdf(make_pdf([PAPER_PAGE_1, PAPER_PAGE_2]), "attention.pdf")

    assert pdf.title == "Attention Is All You Need for Sequence Transduction"
    assert pdf.year == 2017  # from the arXiv ID
    assert pdf.abstract == (
        "The dominant sequence transduction models are based on complex recurrent or "
        "convolutional neural networks. We propose a new simple network architecture, "
        "the Transformer, based solely on attention mechanisms."
    )
    assert pdf.page_count == 2
    # Pages are joined with a blank line, in order.
    assert pdf.full_text == "\n".join(PAPER_PAGE_1) + "\n\n" + "\n".join(PAPER_PAGE_2)


def test_metadata_title_and_author_take_precedence():
    pdf = extract_pdf(
        make_pdf([PAPER_PAGE_1], title="Attention Is All You Need", author="Ashish Vaswani; Noam Shazeer"),
        "x.pdf",
    )
    assert pdf.title == "Attention Is All You Need"
    assert pdf.authors == ["Ashish Vaswani", "Noam Shazeer"]


@pytest.mark.parametrize("junk", ["Microsoft Word - draft.docx", "Untitled document here", "main.tex", "Paper"])
def test_junk_metadata_titles_are_ignored(junk):
    pdf = extract_pdf(make_pdf([PAPER_PAGE_1], title=junk), "x.pdf")
    assert pdf.title == "Attention Is All You Need for Sequence Transduction"


def test_title_falls_back_to_filename():
    pdf = extract_pdf(make_pdf([["Only sentences here, nothing that looks like a title."] * 3]), "dir/notes_v2.pdf")
    assert pdf.title == "notes_v2"


def test_blank_pages_are_skipped_in_full_text():
    pdf = extract_pdf(make_pdf([PAPER_PAGE_1, [], PAPER_PAGE_2]), "x.pdf")
    assert pdf.page_count == 3
    assert "\n\n\n" not in pdf.full_text
    assert pdf.full_text.endswith("BLEU score of 28.4.")


def test_full_text_is_capped(monkeypatch):
    monkeypatch.setattr(pdf_extract, "MAX_TEXT_CHARS", 150)
    pdf = extract_pdf(make_pdf([PAPER_PAGE_1, PAPER_PAGE_2]), "x.pdf")
    assert len(pdf.full_text) == 150


def test_empty_password_encrypted_pdf_is_readable():
    pdf = extract_pdf(encrypt_pdf(make_pdf([PAPER_PAGE_1]), user_password=""), "x.pdf")
    assert "Recurrent neural networks" in pdf.full_text


# --------------------------------------------------------------------------- failures


def test_password_protected_pdf_is_rejected():
    with pytest.raises(PdfExtractionError, match="^This PDF is password-protected.$"):
        extract_pdf(encrypt_pdf(make_pdf([PAPER_PAGE_1]), user_password="secret"), "x.pdf")


def test_corrupt_pdf_is_rejected():
    with pytest.raises(PdfExtractionError, match="^Could not read this PDF"):
        extract_pdf(b"%PDF-1.7 garbage", "x.pdf")


def test_pdf_with_too_little_text_is_rejected():
    # 99 non-whitespace characters: one short of MIN_TEXT_CHARS.
    with pytest.raises(PdfExtractionError, match="No extractable text found"):
        extract_pdf(make_pdf([["a" * 50 + " " + "b" * 49]]), "x.pdf")


def test_pdf_with_just_enough_text_is_accepted():
    pdf = extract_pdf(make_pdf([["a" * 50 + " " + "b" * 50]]), "x.pdf")
    assert pdf.full_text == "a" * 50 + " " + "b" * 50


# --------------------------------------------------------------------------- helpers


def test_title_joins_wrapped_lines():
    lines = ["Learning Representations of", "graphs at Scale", "Ada Lovelace"]
    assert _title_from_text(lines) == ("Learning Representations of graphs at Scale", 2)


def test_title_skips_banners_and_sentences():
    lines = ["Preprint. Under review.", "Published at the 40th Conference on ML", "Deep Residual Learning", "Kaiming He"]
    assert _title_from_text(lines) == ("Deep Residual Learning", 3)


def test_title_rejoins_hyphenated_words():
    assert _title_from_text(["Self-Supervised Repre-", "sentation Learning"])[0] == "Self-Supervised Representation Learning"


def test_authors_from_meta_drops_tool_account_names():
    assert _authors_from_meta("admin") == []
    assert _authors_from_meta("Ada Lovelace and Alan Turing & Grace Hopper") == [
        "Ada Lovelace",
        "Alan Turing",
        "Grace Hopper",
    ]


@pytest.mark.parametrize(
    "line",
    [
        "Ada Lovelace, Alan Turing, Grace Hopper",
        "Ada Lovelace1 Alan Turing2* Grace Hopper†",
        # The docstring promises this "A, B and C" form explicitly.
        "Ada Lovelace, Alan Turing and Grace Hopper",
    ],
    ids=["commas", "space-separated-with-markers", "commas-and"],
)
def test_authors_from_text(line):
    lines = [line, "University of Somewhere", "ada@example.org", "Abstract", "Some Capitalized Words"]
    assert _authors_from_text(lines) == ["Ada Lovelace", "Alan Turing", "Grace Hopper"]


@pytest.mark.parametrize(
    "line, expected",
    [
        ("Ada Lovelace Alan Turing", ["Ada Lovelace", "Alan Turing"]),
        ("Ada Lovelace Alan Turing Grace Hopper", ["Ada Lovelace", "Alan Turing", "Grace Hopper"]),
        # Initials stay with the surrounding first and last name.
        ("John A. Smith Jane Doe", ["John A. Smith", "Jane Doe"]),
        ("J. R. R. Tolkien Ada Lovelace", ["J. R. R. Tolkien", "Ada Lovelace"]),
        ("Ada B. C.-D. Lovelace Alan Turing", ["Ada B. C.-D. Lovelace", "Alan Turing"]),
        # Lowercase particles belong to the last name.
        ("Vincent van Gogh Ada Lovelace", ["Vincent van Gogh", "Ada Lovelace"]),
        ("Ludwig von Mises Ada de la Cruz", ["Ludwig von Mises", "Ada de la Cruz"]),
    ],
    ids=["two-names", "three-names", "middle-initial", "several-initials", "hyphenated-initial", "van", "von-and-de-la"],
)
def test_split_names_groups_long_runs_of_capitalized_words(line, expected):
    assert _split_names(line.split()) == expected


def test_split_names_strips_footnote_markers_before_grouping():
    # Markers glued to names, and markers left as separate tokens, are both removed; the
    # stand-alone ones must not count as words.
    assert _split_names("Ada1 Lovelace* Alan† Turing‡".split()) == ["Ada Lovelace", "Alan Turing"]
    assert _split_names("Ada * Lovelace 1 Alan Turing".split()) == ["Ada Lovelace", "Alan Turing"]


def test_split_names_never_swallows_the_last_word_as_an_initial():
    # The trailing "B." must end the name, not start a scan past the end of the list.
    assert _split_names("Ada Lovelace Alan B.".split()) == ["Ada Lovelace", "Alan B."]


@pytest.mark.parametrize(
    "line, expected",
    [("Ada Lovelace", ["Ada Lovelace"]), ("Ada King Lovelace", ["Ada King Lovelace"]), ("Ada", [])],
)
def test_split_names_keeps_up_to_three_words_as_one_name(line, expected):
    assert _split_names(line.split()) == expected


def test_split_names_documented_limitation_for_three_part_names():
    # The docstring states that three-part names without an initial are split wrongly.
    assert _split_names("Juan Carlos Niebles Ada".split()) == ["Juan Carlos", "Niebles Ada"]


@pytest.mark.parametrize(
    "line",
    ["Ada Lovelace Alan Turing Grace", "Juan Carlos Niebles Fei-Fei Li", "Ada Lovelace Alan Turing Grace Hopper Linus"],
    ids=["five-words", "five-words-three-part-name", "seven-words"],
)
def test_split_names_never_drops_a_word_with_odd_word_counts(line):
    # Grouping may be imperfect for three-part names (documented), but no author word may be
    # lost: every input word must appear in exactly one of the returned names.
    words = line.split()
    names = _split_names(words)
    assert [w for name in names for w in name.split()] == words


def test_long_author_line_is_split_end_to_end():
    lines = ["Ada Lovelace Alan Turing Grace Hopper", "University of Somewhere", "Abstract"]
    assert _authors_from_text(lines) == ["Ada Lovelace", "Alan Turing", "Grace Hopper"]


def test_authors_stop_at_prose():
    assert _authors_from_text(["Ada Lovelace", "We study the problem of things."]) == ["Ada Lovelace"]


def test_year_prefers_venue_line_over_cited_years():
    page = "Published at the Conference on Learning 2019\nAs shown by Smith (2021) and Doe (2015)"
    assert _year(page, None) == 2019


def test_year_uses_latest_plausible_year_and_ignores_future_years():
    next_year = datetime.now(UTC).year + 1
    page = f"Smith 2015 and Doe 2018 and a typo {next_year}; arXiv-like 2012.12345"
    assert _year(page, None) == 2018


def test_year_falls_back_to_creation_date():
    pdf = extract_pdf(make_pdf([FILLER], creation_date=datetime(2016, 3, 4)), "x.pdf")
    assert pdf.year == 2016


def test_year_is_none_without_any_signal():
    assert _year("No years here", None) is None


@pytest.mark.parametrize("raw", ["D:garbage", "not a date", "D:2016-13-45", "D:20161345000000"])
def test_malformed_creation_date_gives_no_year_instead_of_failing(raw):
    # pypdf raises ValueError when it parses these; the upload must still succeed.
    pdf = extract_pdf(make_pdf([FILLER], creation_date=raw), "x.pdf")
    assert pdf.year is None
    assert pdf.full_text.startswith("Body text")


def test_valid_creation_date_with_timezone_is_used():
    pdf = extract_pdf(make_pdf([FILLER], creation_date="D:20160304120000+05'00'"), "x.pdf")
    assert pdf.year == 2016


def test_metadata_without_creation_date_gives_no_year():
    pdf = extract_pdf(make_pdf([FILLER], title="A Paper With Metadata"), "x.pdf")
    assert pdf.year is None


def test_year_survives_any_exception_from_the_date_property():
    class BrokenMeta:
        @property
        def creation_date(self):
            raise TypeError("unexpected pypdf failure")

    assert _year("No years here", BrokenMeta()) is None


def test_text_years_win_over_a_malformed_creation_date():
    pdf = extract_pdf(make_pdf([[*FILLER, "Published in 2019"]], creation_date="D:garbage"), "x.pdf")
    assert pdf.year == 2019


def test_short_abstract_is_dropped():
    pdf = extract_pdf(make_pdf([["Abstract", "Too short.", "1 Introduction", *FILLER]]), "x.pdf")
    assert pdf.abstract is None


def test_sanitize_joins_surrogate_pairs_and_replaces_lone_ones():
    assert _sanitize("x = 𝐱") == "x = 𝐱"
    cleaned = _sanitize("bad \ud835 end")
    assert cleaned == "bad � end"
    cleaned.encode("utf-8")  # must not raise


def test_page_text_survives_a_broken_page():
    class BrokenPage:
        def extract_text(self):
            raise ValueError("bad content stream")

    assert _page_text(BrokenPage()) == ""


def test_page_text_normalizes_whitespace_and_nul_bytes():
    class Page:
        def extract_text(self):
            return "  Hello\x00   world \t here  \n\n  next   line  "

    assert _page_text(Page()) == "Hello world here\n\nnext line"
