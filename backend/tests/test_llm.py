"""Unit tests for backend/services/llm.py (OpenAI is mocked)."""

import openai
import pytest

from backend.schemas import ChatMessage
from backend.services import llm
from backend.services.llm import LLMError
from helpers import FakeOpenAI, completion, openai_request, openai_status_response


def test_get_client_requires_api_key():
    with pytest.raises(LLMError) as info:
        llm._get_client()
    assert info.value.status_code == 503
    assert str(info.value) == "OPENAI_API_KEY is not set in .env, so AI features are disabled."


def test_get_client_is_created_once_with_key_and_timeout(monkeypatch, mocker):
    monkeypatch.setattr(llm, "OPENAI_API_KEY", "sk-test")
    constructor = mocker.patch.object(llm.openai, "OpenAI")

    first = llm._get_client()
    second = llm._get_client()

    constructor.assert_called_once_with(api_key="sk-test", timeout=90)
    assert first is second is constructor.return_value


def test_paper_context_wraps_full_text():
    assert llm._paper_context("My Title", "Body text.") == '<paper title="My Title">\nBody text.\n</paper>'


def test_paper_context_truncates_long_text_and_says_so(monkeypatch):
    monkeypatch.setattr(llm, "MAX_CONTEXT_CHARS", 10)
    context = llm._paper_context("T", "0123456789ABCDEF")
    assert context.startswith('<paper title="T">\n0123456789\n</paper>')
    assert "ABCDEF" not in context
    assert "[Note: the paper text was truncated" in context


def test_paper_context_at_exact_limit_is_not_truncated(monkeypatch):
    monkeypatch.setattr(llm, "MAX_CONTEXT_CHARS", 10)
    assert "Note" not in llm._paper_context("T", "0123456789")


def test_summarize_builds_system_and_user_messages(monkeypatch):
    fake = FakeOpenAI()
    monkeypatch.setattr(llm, "_get_client", lambda: fake)

    assert llm.summarize("T", "full text") == "A summary."

    assert fake.messages == [
        {"role": "system", "content": f'{llm.SUMMARY_INSTRUCTIONS}\n\n<paper title="T">\nfull text\n</paper>'},
        {"role": "user", "content": "Summarize this paper."},
    ]


def test_answer_keeps_only_the_last_ten_history_messages(monkeypatch):
    fake = FakeOpenAI()
    monkeypatch.setattr(llm, "_get_client", lambda: fake)
    history = [ChatMessage(role="user" if i % 2 == 0 else "assistant", content=f"m{i}") for i in range(14)]

    llm.answer("T", "text", "final question", history)

    contents = [m["content"] for m in fake.messages]
    assert contents[1:] == [f"m{i}" for i in range(4, 14)] + ["final question"]
    assert len(fake.messages) == 1 + llm.MAX_HISTORY_MESSAGES + 1


def test_complete_strips_whitespace(monkeypatch):
    fake = FakeOpenAI()
    fake.reply("\n  answer \n")
    monkeypatch.setattr(llm, "_get_client", lambda: fake)
    assert llm._complete([]) == "answer"


@pytest.mark.parametrize("content", [None, ""])
def test_complete_rejects_empty_responses(monkeypatch, content):
    fake = FakeOpenAI()
    fake.create.return_value = completion(content)
    monkeypatch.setattr(llm, "_get_client", lambda: fake)
    with pytest.raises(LLMError) as info:
        llm._complete([])
    assert info.value.status_code == 502
    assert str(info.value) == "The model returned an empty response. Try again."


@pytest.mark.parametrize(
    "error, status, message",
    [
        (
            lambda: openai.AuthenticationError("bad key", response=openai_status_response(401), body=None),
            503,
            "The OpenAI API key is invalid. Check OPENAI_API_KEY in .env.",
        ),
        (
            lambda: openai.RateLimitError("slow down", response=openai_status_response(429), body=None),
            429,
            "OpenAI rate limit or quota exceeded. Wait a moment and try again.",
        ),
        (
            lambda: openai.APITimeoutError(request=openai_request()),
            502,
            "The OpenAI request timed out. Try again.",
        ),
        (
            lambda: openai.APIConnectionError(request=openai_request()),
            502,
            "Could not reach the OpenAI API.",
        ),
        (
            lambda: openai.APIError("server exploded", openai_request(), body=None),
            502,
            "OpenAI API error: server exploded",
        ),
        (
            lambda: openai.InternalServerError("upstream 500", response=openai_status_response(500), body=None),
            502,
            "OpenAI API error: upstream 500",
        ),
    ],
    ids=["auth", "rate-limit", "timeout", "connection", "api-error", "server-error"],
)
def test_complete_maps_openai_errors(monkeypatch, error, status, message):
    fake = FakeOpenAI()
    fake.fail(error())
    monkeypatch.setattr(llm, "_get_client", lambda: fake)

    with pytest.raises(LLMError) as info:
        llm._complete([{"role": "user", "content": "hi"}])

    assert info.value.status_code == status
    assert str(info.value) == message
