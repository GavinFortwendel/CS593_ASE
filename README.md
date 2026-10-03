# AI Research Assistant

A small web app for finding and understanding research papers: search Semantic Scholar, save papers to a local library, upload PDFs, and ask an LLM to summarize or answer questions about a paper. Built for CS593 HW1.

## Features

| Feature | Status |
| --- | --- |
| Search papers by keyword/topic (title, authors, year, abstract, link) | ✅ Done |
| Save papers to a local library (SQLite), browse/remove them in the Library tab | ✅ Done |
| Upload PDF papers and extract metadata | ✅ Done |
| LLM summary of a paper (based on its full text) | ✅ Done |
| Ask questions about a paper (multi-turn chat) | ✅ Done |

## Stack

- **Frontend:** React 19 + TypeScript, built with Vite, styled with Tailwind CSS v4
- **Backend:** FastAPI (Python 3.12)
- **Paper search:** [Semantic Scholar Graph API](https://api.semanticscholar.org/)
- **Database:** SQLite via SQLAlchemy 2.0 · **PDF processing:** `pypdf` · **LLM:** OpenAI API (`gpt-4o-mini`)

## Project structure

```
backend/
  main.py                    FastAPI app, CORS, router registration
  config.py                  Loads settings from .env
  database.py                SQLAlchemy engine, session dependency, table creation
  models.py                  ORM models (SavedPaper -> "papers" table)
  schemas.py                 Pydantic API models (Paper, LibraryPaper, SearchResponse)
  routers/search.py          GET /api/search
  routers/library.py         Library CRUD, PDF upload, summarize and Q&A endpoints
  services/semantic_scholar.py   Semantic Scholar client
  services/pdf_extract.py    PDF text + heuristic metadata extraction (pypdf)
  services/paper_text.py     Gets a paper's full text (fetches open-access PDFs on demand)
  services/llm.py            OpenAI prompts for summaries and Q&A
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
      UploadPdf.tsx          PDF upload drop zone
      PaperAssistant.tsx     Summary + Q&A chat panel for a library paper
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
cp .env.example .env         # add OPENAI_API_KEY (required for AI features)
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
| POST | `/api/library/upload` | Upload a PDF (multipart `file`). Extracts text + metadata and saves it |
| POST | `/api/library/{paper_id}/summarize` | LLM summary from the paper's full text → `{ summary }` |
| POST | `/api/library/{paper_id}/qa` | Body `{ question, history: [{ role, content }] }` → `{ answer }` |
| DELETE | `/api/library/{paper_id}` | Remove a saved paper. `204` on success, `404` if not saved |

AI endpoint errors: `404` paper not in library, `422` no full text available, `503` OpenAI key missing/invalid, `429` OpenAI rate limit, `502` other OpenAI failures.

## Notes

- Semantic Scholar often omits abstracts for licensing reasons; the UI shows "No abstract available" in that case.
- Without an API key, Semantic Scholar uses a shared rate-limited pool, so occasional `503` responses are expected — the UI shows a Retry button.
- The library is stored in `backend/library.db` (created automatically on first start, git-ignored). Set `DATABASE_URL` in `.env` to use a different location. To reset the library, stop the backend and delete the file.
- There are no migrations: tables are created with `create_all`, which won't alter an existing table. If the schema changes, delete `backend/library.db`.
- **Where the LLM's paper text comes from:** summaries and answers are always based on the paper's extracted full text, never just its metadata. Uploaded PDFs store their text at upload time. Papers saved from search have no text until the first time you use "Ask AI" on them; the backend then downloads the paper's open-access PDF, extracts its text and caches it in the database. Papers without an open-access PDF (or whose link leads to a web page instead of a PDF) can't be summarized; download the PDF and upload it instead.
- Paper text sent to the model is capped at 200k characters (~50k tokens) to stay inside `gpt-4o-mini`'s context window and keep costs low; longer papers lose their final pages (usually references/appendices).
- Summaries and chat history are kept in the browser only (not saved), and Q&A sends the last 10 messages as context for follow-up questions.
- Never commit `.env` files or API keys.
