from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .database import engine
from .models import Base
from .routers import auth, vms, requests, settings

# Create all tables on startup
Base.metadata.create_all(bind=engine)


def _migrate_db():
    """Add new columns to existing SQLite databases without Alembic."""
    migrations = [
        ("virtual_machines", "disks", "TEXT DEFAULT '[]'"),
        ("requests", "add_disk_gb", "FLOAT"),
    ]
    with engine.connect() as conn:
        for table, column, col_def in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
                conn.commit()
            except Exception:
                pass  # Column already exists


_migrate_db()

app = FastAPI(
    title="VM Request Portal API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(vms.router, prefix="/api")
app.include_router(requests.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
