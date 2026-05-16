"""Enable pgvector extension on Heroku PostgreSQL."""
from sqlalchemy import text
from app.core.database import engine

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn.commit()
    print("pgvector extension enabled successfully!")
