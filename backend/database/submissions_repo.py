"""
submissions_repo.py
--------------------
Database access functions for submissions, reviews, and chroma_link.
Keeps raw SQL out of routes/api.py — same separation pattern as
services/ingestor.py and services/rag.py.

TEMPORARY: TEST_STUDENT_ID is hardcoded since real auth isn't built yet.
Replace this with the actual logged-in user's id once login is real.
"""

import uuid
from datetime import datetime, timezone
from database.db import get_connection

# TEMPORARY — replace with real session user once auth exists
TEST_STUDENT_ID = "11111111-1111-1111-1111-111111111111"


def _now():
    """Returns current UTC time as an ISO string, matching schema.sql's TEXT timestamps."""
    return datetime.now(timezone.utc).isoformat()


def ensure_test_user():
    """
    Creates the hardcoded test student user if it doesn't already exist.
    Called once at app startup so create_submission() always has a valid
    student_id to reference (submissions.student_id has a FOREIGN KEY
    constraint — it will fail silently/loudly if this user doesn't exist).
    """
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM users WHERE id = ?", (TEST_STUDENT_ID,)
    ).fetchone()

    if not existing:
        conn.execute(
            """INSERT INTO users (id, username, password_hash, role, full_name, email, department, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (TEST_STUDENT_ID, "test_student", "no_password_yet", "student",
             "Test Student", "test@isat-u.edu.ph", "Unknown", _now())
        )
        conn.commit()
    conn.close()


def create_submission(title, lead_researcher, research_members,
                       department, school_year, abstract, source_stem):
    """
    Inserts a new submission row with status='pending'.
    Called from routes/api.py's route_ingest, right after ingest_pdf()
    succeeds — source_stem must exactly match what ingest_pdf() used,
    since that's the same value ChromaDB's metadata["source"] carries.

    Returns the new submission's id (str).
    """
    conn = get_connection()
    sub_id = str(uuid.uuid4())

    conn.execute(
        """INSERT INTO submissions
           (id, student_id, title, lead_researcher, research_members,
            department, school_year, abstract, source_stem, status, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
        (sub_id, TEST_STUDENT_ID, title, lead_researcher, research_members,
         department, school_year, abstract, source_stem, _now())
    )
    conn.commit()
    conn.close()
    return sub_id


def get_submission_by_source(source_stem):
    """
    Returns the submission row matching this source_stem, or None.
    Used by route_approve to find which submission to update.
    """
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM submissions WHERE source_stem = ?", (source_stem,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def approve_submission(source_stem, public_pdf_path, chunk_count, page_count):
    """
    Marks a submission as approved and records its ChromaDB/watermark
    info in chroma_link. Called from route_approve, right after
    watermark_pdf() succeeds.

    Two writes, both required for a successful approval:
      1. submissions.status -> 'approved', approved_at set
      2. chroma_link row created (or updated if it already exists)

    Returns True if the submission was found and updated, False if no
    submission exists for this source_stem (caller should treat that
    as an error — approving something with no submission row is a bug).
    """
    conn = get_connection()
    sub = conn.execute(
        "SELECT id FROM submissions WHERE source_stem = ?", (source_stem,)
    ).fetchone()

    if not sub:
        conn.close()
        return False

    sub_id = sub["id"]
    now = _now()

    conn.execute(
        "UPDATE submissions SET status = 'approved', approved_at = ? WHERE id = ?",
        (now, sub_id)
    )

    # Upsert chroma_link — submission_id is UNIQUE, so re-approving
    # (e.g. after a fixed re-upload) updates the existing row instead
    # of violating the unique constraint with a duplicate insert.
    existing_link = conn.execute(
        "SELECT id FROM chroma_link WHERE submission_id = ?", (sub_id,)
    ).fetchone()

    if existing_link:
        conn.execute(
            """UPDATE chroma_link
               SET public_pdf_path = ?, chunk_count = ?, page_count = ?, watermarked_at = ?
               WHERE submission_id = ?""",
            (public_pdf_path, chunk_count, page_count, now, sub_id)
        )
    else:
        conn.execute(
            """INSERT INTO chroma_link
               (id, submission_id, source_stem, public_pdf_path, chunk_count, page_count, watermarked_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), sub_id, source_stem, public_pdf_path, chunk_count, page_count, now)
        )

    conn.commit()
    conn.close()
    return True


def record_review(source_stem, action, comments):
    """
    Writes a review row (validated/returned) and, for 'returned',
    updates submissions.status back to 'returned' with feedback set.
    'validated' reviews don't need to touch submissions.status here —
    approve_submission() already set it to 'approved' when watermarking
    succeeded; this just adds the audit-trail row.

    TEMPORARY: librarian_id is hardcoded to TEST_STUDENT_ID's same UUID
    pattern below since there's no real librarian login yet either.
    """
    conn = get_connection()
    sub = conn.execute(
        "SELECT id FROM submissions WHERE source_stem = ?", (source_stem,)
    ).fetchone()

    if not sub:
        conn.close()
        return False

    sub_id = sub["id"]
    review_id = str(uuid.uuid4())

    # TEMPORARY — same placeholder pattern as TEST_STUDENT_ID, see ensure_test_user()
    test_librarian_id = "22222222-2222-2222-2222-222222222222"

    conn.execute(
        """INSERT INTO reviews (id, submission_id, librarian_id, action, comments, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (review_id, sub_id, test_librarian_id, action, comments, _now())
    )

    if action == "returned":
        conn.execute(
            "UPDATE submissions SET status = 'returned', feedback = ? WHERE id = ?",
            (comments, sub_id)
        )

    conn.commit()
    conn.close()
    return True


def get_approved_source_stems():
    """
    Returns a set of source_stems for all approved submissions.
    Used by vectorstore.py to filter Browse listings and AI-analysis
    retrieval down to only approved papers — this is the actual fix
    for the visibility gap (unapproved papers showing up everywhere).
    """
    conn = get_connection()
    rows = conn.execute(
        "SELECT source_stem FROM submissions WHERE status = 'approved'"
    ).fetchall()
    conn.close()
    return {row["source_stem"] for row in rows}