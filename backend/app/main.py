from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.database import engine, Base
import app.models  # noqa: F401 — ensure all models are registered with Base
from app.platform.paradigm_registry import paradigm_registry
from app.routers import chat, conversations, knowledge_graph

app = FastAPI(title="Priestess", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    paradigm_registry.discover("paradigms")

# Routers
app.include_router(conversations.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(knowledge_graph.router, prefix="/api")

# Serve a minimal test page
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def root():
    return {"status": "Priestess is running"}
