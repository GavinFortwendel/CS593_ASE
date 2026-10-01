# AI Research Assistant

A small web app for finding and understanding research papers: search Semantic Scholar, save papers to a local library, upload PDFs, and ask an LLM to summarize or answer questions about a paper. Built for CS593 HW1.

## Features

| Feature | Status |
| --- | --- |
| Search papers by keyword/topic (title, authors, year, abstract, link) | ✅ Done |
| Save papers to a local library (SQLite), browse/remove them in the Library tab | ✅ Done |
| Upload PDF papers and extract metadata | Planned |
| LLM summary of a paper (based on its full text) | Planned |
| Ask questions about a paper | Planned |

## Stack

- **Frontend:** React 19 + TypeScript, built with Vite, styled with Tailwind CSS v4
- **Backend:** FastAPI (Python 3.12)
- **Paper search:** [Semantic Scholar Graph API](https://api.semanticscholar.org/)
- **Database:** SQLite via SQLAlchemy 2.0 · **PDF processing:** `pypdf` (planned) · **LLM:** Anthropic/OpenAI API (planned)

## Project structure

```
backend/
  main.py                    FastAPI app, CORS, router registration
  config.py                  Loads settings from .env
  database.py                SQLAlchemy engine, session dependency, table creation
  models.py                  ORM models (SavedPaper -> "papers" table)
  schemas.py                 Pydantic API models (Paper, LibraryPaper, SearchResponse)
  routers/search.py          GET /api/search
  routers/library.py         GET/POST /api/library, DELETE /api/library/{paper_id}
  services/semantic_scholar.py   Semantic Scholar client
frontend/
  src/
    App.tsx                  Page layout, Search/Library tabs, search + library state
    api.ts                   Backend client (fetch wrapper, ApiError)
    types.ts                 TS types mirroring backend/schemas.py
    components/
      SearchBar.tsx          Search input
      Results.tsx            Loading / error / empty / results states
      PaperCard.tsx          One paper (Save to Library / Remove, Open PDF)
      LibraryView.tsx        Saved papers list
```

## Setup

### Prerequisites

- Python 3.12+
- Node.js 22 LTS (e.g. via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`)

### Backend

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # optionally add a SEMANTIC_SCHOLAR_API_KEY
fastapi dev backend/main.py  # http://localhost:8000 (API docs at /docs)
```

### Frontend

In a second terminal, from the repo root:

```bash
npm install --prefix frontend
npm run dev --prefix frontend   # http://localhost:5173
```

The frontend calls the backend at `http://localhost:8000` by default. To point it elsewhere, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/search?q=&limit=10&offset=0` | Search papers. Errors: `503` rate-limited, `504` timed out, `502` upstream failure |
| GET | `/api/library` | List saved papers, newest first |
| POST | `/api/library` | Save a paper (body: a `Paper` from search). `201` if new, `200` if already saved |
| DELETE | `/api/library/{paper_id}` | Remove a saved paper. `204` on success, `404` if not saved |

## Notes

- Semantic Scholar often omits abstracts for licensing reasons; the UI shows "No abstract available" in that case.
- Without an API key, Semantic Scholar uses a shared rate-limited pool, so occasional `503` responses are expected — the UI shows a Retry button.
- The library is stored in `backend/library.db` (created automatically on first start, git-ignored). Set `DATABASE_URL` in `.env` to use a different location. To reset the library, stop the backend and delete the file.
- There are no migrations: tables are created with `create_all`, which won't alter an existing table. If the schema changes, delete `backend/library.db`.
- Never commit `.env` files or API keys.
