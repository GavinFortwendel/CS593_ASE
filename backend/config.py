import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Optional: Semantic Scholar works without a key, but at a lower shared rate limit.
SEMANTIC_SCHOLAR_API_KEY: str | None = os.getenv("SEMANTIC_SCHOLAR_API_KEY") or None

# Absolute path so the DB lands in backend/ no matter which directory the server is started from.
DATABASE_URL: str = os.getenv("DATABASE_URL") or f"sqlite:///{Path(__file__).parent / 'library.db'}"
