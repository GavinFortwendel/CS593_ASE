import os

from dotenv import load_dotenv

load_dotenv()

# Optional: Semantic Scholar works without a key, but at a lower shared rate limit.
SEMANTIC_SCHOLAR_API_KEY: str | None = os.getenv("SEMANTIC_SCHOLAR_API_KEY") or None
