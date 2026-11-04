"""Test doubles shared by several test modules."""

import types
from collections.abc import Callable
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import httpx2  # the openai SDK builds its errors from httpx2 objects, not httpx

ResponseSpec = httpx.Response | Exception | Callable[[httpx.Request], "httpx.Response | Exception"]


class FakeHTTP:
    """A scripted HTTP server for httpx.MockTransport.

    Queue responses with `respond(...)`; each incoming request consumes the next one. A queued
    exception (or a callable returning one) is raised instead, which is how transport failures
    such as timeouts are simulated. An unexpected extra request fails the test loudly.
    """

    def __init__(self) -> None:
        self.queue: list[ResponseSpec] = []
        self.requests: list[httpx.Request] = []
        self.sleeps: list[float] = []

    def respond(self, *responses: ResponseSpec) -> "FakeHTTP":
        self.queue.extend(responses)
        return self

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not self.queue:
            raise AssertionError(f"Unexpected HTTP request: {request.method} {request.url}")
        result = self.queue.pop(0)
        if callable(result) and not isinstance(result, httpx.Response):
            result = result(request)
        if isinstance(result, Exception):
            raise result
        return result


def patched_httpx(client_name: str, fake: FakeHTTP) -> types.ModuleType:
    """A copy of the httpx module whose `client_name` class always uses `fake` as transport.

    Installed on a single application module (monkeypatch.setattr(module, "httpx", ...)), so the
    real httpx, and FastAPI's TestClient that is built on it, are left untouched.
    """
    module = types.ModuleType("httpx")
    module.__dict__.update(httpx.__dict__)
    real_client = getattr(httpx, client_name)

    def factory(*args, **kwargs):
        return real_client(*args, transport=httpx.MockTransport(fake), **kwargs)

    setattr(module, client_name, factory)
    return module


def completion(content: str | None) -> SimpleNamespace:
    """The minimal shape of an OpenAI ChatCompletion that the app reads."""
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class FakeOpenAI:
    """Stands in for openai.OpenAI(). `create` is a MagicMock recording every call."""

    def __init__(self) -> None:
        self.create = MagicMock(return_value=completion("A summary."))
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def reply(self, content: str | None) -> None:
        self.create.side_effect = None
        self.create.return_value = completion(content)

    def fail(self, exc: Exception) -> None:
        self.create.side_effect = exc

    @property
    def messages(self) -> list[dict]:
        return self.create.call_args.kwargs["messages"]


_OPENAI_REQUEST = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")


def openai_status_response(status: int) -> httpx2.Response:
    return httpx2.Response(status, request=_OPENAI_REQUEST)


def openai_request() -> httpx2.Request:
    return _OPENAI_REQUEST


def parse_utc(value: str) -> datetime:
    """Parse the API's ISO timestamps; requires an explicit UTC offset or 'Z'."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None, f"timestamp {value!r} has no timezone"
    return parsed
