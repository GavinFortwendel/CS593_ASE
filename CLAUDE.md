# Project Overview
This is a small web application functioning as an AI Research Assistant for a university assignment. The focus is on end-to-end functionality rather than production-ready perfection. 

# Architecture & Stack
- **Frontend:** React with Tailwind CSS
- **Backend:** FastAPI (Python)
- **Database:** SQLite (local persistence)
- **APIs:** Semantic Scholar (for paper search), Anthropic/OpenAI API (for summarization/Q&A)
- **PDF Processing:** `pypdf` for extracting text from uploaded files

# Universal Rules
- **No Secrets:** Never commit `.env` files, API keys, passwords, or other credentials.
- **Context Injection:** When summarizing or answering questions about a paper, always base the LLM response on the extracted text/content of the paper, never just the metadata.
- **Explain Tradeoffs:** If implementing a non-obvious architectural decision or working around a bug, explicitly state your reasoning so it can be documented for the assignment reflection report.

# Commands
- Backend Start: `fastapi dev backend/main.py`
- Frontend Start: `npm run dev --prefix frontend`