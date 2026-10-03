"""OpenAI calls for paper summaries and Q&A.

Prompts always contain the paper's extracted text, never only its metadata. The text goes in the
system message, not the user turn. That makes the prompt prefix identical for every question about
a paper, which suits OpenAI's automatic prompt caching (cheaper follow-up questions), and it keeps
the "answer only from the paper" instruction apart from what the user types.
"""

import openai

from backend.config import MAX_CONTEXT_CHARS, OPENAI_API_KEY, OPENAI_MODEL
from backend.schemas import ChatMessage

TIMEOUT_SECONDS = 90
MAX_HISTORY_MESSAGES = 10  # earlier turns are dropped to bound prompt size

SUMMARY_INSTRUCTIONS = """You are a research assistant summarizing an academic paper.
Base the summary ONLY on the paper text provided below. Do not add outside knowledge, and do not \
guess about content that is not in the text.

Write plain text (no Markdown headings or bold), using these sections, each starting with its \
label on its own line:
Problem: what problem the paper addresses and why it matters.
Approach: the main idea of the proposed method.
Key results: the main findings, with concrete numbers where the paper gives them.
Limitations: limitations stated in the paper, or "Not discussed in the paper."
Keep it under about 350 words. Short "- " bullet lists are fine inside a section."""

QA_INSTRUCTIONS = """You are a research assistant answering questions about one academic paper.
Answer strictly from the paper text provided below. If the paper does not contain the answer, \
say so plainly instead of guessing. Do not use outside knowledge. Be concise and specific, and \
mention the relevant section or numbers from the paper where helpful. Write plain text \
(no Markdown headings or bold)."""

_client: openai.OpenAI | None = None


class LLMError(Exception):
    """An LLM call failed. The message is shown to the user; `status_code` is the HTTP status."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _get_client() -> openai.OpenAI:
    # Created on first use so the server starts (and search/library work) without a key.
    global _client
    if not OPENAI_API_KEY:
        raise LLMError("OPENAI_API_KEY is not set in .env, so AI features are disabled.", 503)
    if _client is None:
        _client = openai.OpenAI(api_key=OPENAI_API_KEY, timeout=TIMEOUT_SECONDS)
    return _client


def _paper_context(title: str, text: str) -> str:
    truncated = len(text) > MAX_CONTEXT_CHARS
    note = (
        "\n[Note: the paper text was truncated to fit the model's context; later sections "
        "such as appendices or references may be missing.]"
        if truncated
        else ""
    )
    return f'<paper title="{title}">\n{text[:MAX_CONTEXT_CHARS]}\n</paper>{note}'


def _complete(messages: list[dict]) -> str:
    try:
        response = _get_client().chat.completions.create(
            model=OPENAI_MODEL, messages=messages, temperature=0.2
        )
    except openai.AuthenticationError as exc:
        raise LLMError("The OpenAI API key is invalid. Check OPENAI_API_KEY in .env.", 503) from exc
    except openai.RateLimitError as exc:
        raise LLMError(
            "OpenAI rate limit or quota exceeded. Wait a moment and try again.", 429
        ) from exc
    except openai.APITimeoutError as exc:
        raise LLMError("The OpenAI request timed out. Try again.") from exc
    except openai.APIConnectionError as exc:
        raise LLMError("Could not reach the OpenAI API.") from exc
    except openai.APIError as exc:
        raise LLMError(f"OpenAI API error: {exc}") from exc

    content = response.choices[0].message.content
    if not content:
        raise LLMError("The model returned an empty response. Try again.")
    return content.strip()


def summarize(title: str, text: str) -> str:
    return _complete(
        [
            {"role": "system", "content": f"{SUMMARY_INSTRUCTIONS}\n\n{_paper_context(title, text)}"},
            {"role": "user", "content": "Summarize this paper."},
        ]
    )


def answer(title: str, text: str, question: str, history: list[ChatMessage]) -> str:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": f"{QA_INSTRUCTIONS}\n\n{_paper_context(title, text)}"}
    ]
    messages += [{"role": m.role, "content": m.content} for m in history[-MAX_HISTORY_MESSAGES:]]
    messages.append({"role": "user", "content": question})
    return _complete(messages)
