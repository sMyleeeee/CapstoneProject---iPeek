"""
db.py
-----
SQLite connection and initialization. Run once at app startup —
creates ipeek.db from schema.sql if it doesn't already exist.
"""

import sqlite3
from pathlib import Path

DB_PATH     = Path(__file__).resolve().parent / "ipeek.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def get_connection():
    """Returns a new SQLite connection with foreign keys enforced."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row  # lets you access columns by name
    return conn


def init_db():
    """Creates all tables from schema.sql if they don't already exist."""
    conn = get_connection()
    with open(SCHEMA_PATH, "r") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()

    # Ensure the hardcoded test student exists — create_submission()
    # depends on this user existing (foreign key constraint).
    from database.submissions_repo import ensure_test_user
    ensure_test_user()