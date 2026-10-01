from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db
from backend.routers import library, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create SQLite tables on first run
    yield


app = FastAPI(title="AI Research Assistant", lifespan=lifespan)

# Allow the Vite/React dev server to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api")
app.include_router(library.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
