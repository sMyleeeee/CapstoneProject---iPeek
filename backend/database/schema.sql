CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('student', 'librarian', 'admin')),
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    department      TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
    id                  TEXT PRIMARY KEY,
    student_id          TEXT NOT NULL REFERENCES users(id),
    title               TEXT NOT NULL,
    lead_researcher     TEXT NOT NULL,
    research_members    TEXT,
    department          TEXT NOT NULL,
    school_year         TEXT,
    abstract            TEXT,
    source_stem         TEXT NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'returned')),
    feedback            TEXT,
    submitted_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at         TEXT
);

CREATE TABLE IF NOT EXISTS submission_versions (
    id                  TEXT PRIMARY KEY,
    submission_id       TEXT NOT NULL REFERENCES submissions(id),
    version_number      INTEGER NOT NULL,
    pending_file_path   TEXT NOT NULL,
    uploaded_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (submission_id, version_number)
);

CREATE TABLE IF NOT EXISTS reviews (
    id                  TEXT PRIMARY KEY,
    submission_id       TEXT NOT NULL REFERENCES submissions(id),
    librarian_id        TEXT NOT NULL REFERENCES users(id),
    action              TEXT NOT NULL CHECK (action IN ('validated', 'returned')),
    comments            TEXT,
    reviewed_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chroma_link (
    id                  TEXT PRIMARY KEY,
    submission_id       TEXT NOT NULL UNIQUE REFERENCES submissions(id),
    source_stem         TEXT NOT NULL,
    public_pdf_path     TEXT,
    chunk_count         INTEGER,
    page_count          INTEGER,
    embedding_model     TEXT NOT NULL DEFAULT 'BAAI/bge-m3',
    watermarked_at      TEXT
);