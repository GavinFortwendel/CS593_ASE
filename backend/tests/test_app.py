"""App wiring: test isolation, health check, CORS."""

from backend import config, database


def test_tests_never_touch_the_real_database_or_api_keys():
    # Guards the suite itself: if pytest-env isn't applied, these tests would write to library.db
    # and could spend real API credit.
    assert config.DATABASE_URL == "sqlite:///:memory:"
    assert database.engine.url.database == ":memory:"
    assert config.OPENAI_API_KEY is None
    assert config.SEMANTIC_SCHOLAR_API_KEY is None


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_preflight_allows_the_vite_dev_server(client):
    response = client.options(
        "/api/library",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_headers_are_present_on_error_responses(client):
    # The app turns failures into HTTPExceptions specifically so the browser gets CORS headers
    # and can show the error message instead of "Cannot reach the server".
    response = client.delete("/api/library/missing", headers={"Origin": "http://127.0.0.1:5173"})
    assert response.status_code == 404
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_cors_rejects_unknown_origins(client):
    response = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
