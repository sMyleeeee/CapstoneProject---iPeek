# iPeek — Centralized Digital Research Repository

iPeek is a research repository system for ISAT-U that allows students to submit
research papers, librarians to review and validate submissions, and an AI-powered
RAG (Retrieval-Augmented Generation) pipeline to provide similarity analysis,
summaries, research gap identification, and a conversational research assistant.

---

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** Flask (Python)
- **Vector Database:** ChromaDB
- **Embeddings:** BAAI/bge-m3
- **Reranker:** BAAI/bge-reranker-v2-m3
- **LLM:** Groq (llama-3.3-70b-versatile)
- **PDF Processing:** PyMuPDF (fitz)

---

## Project Structure

```
ipeek/
├── backend/
│   ├── app.py                 # Flask entry point
│   ├── config.py              # Central config (env vars, model names, RAG settings)
│   ├── routes/
│   │   ├── __init__.py
│   │   └── api.py             # All API endpoints
│   └── services/
│       ├── __init__.py
│       ├── ingestor.py        # PDF ingestion pipeline
│       ├── rag.py             # RAG analysis functions (similarity, summary, gaps, chat)
│       ├── reranker.py        # Cross-encoder reranking
│       └── vectorstore.py     # ChromaDB singleton
│
├── frontend/
│   ├── index.html             # Login page
│   ├── dashboard.html         # Librarian/Admin dashboard
│   ├── browse.html            # Browse research (student view)
│   ├── detail.html            # Research detail + AI analysis
│   ├── profile.html           # User profile settings
│   ├── review.html            # Librarian review queue
│   ├── upload.html             # Student research submission
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js             # Centralized API calls
│       ├── browse.js
│       ├── detail.js
│       ├── profile.js
│       ├── review.js
│       └── upload.js
│
├── papers/                     # Uploaded PDFs (ignored by git)
├── chroma_db/                  # ChromaDB persistent storage (ignored by git)
├── venv/                       # Python virtual environment (ignored by git)
├── .env                        # Environment variables (ignored by git — NOT in repo)
├── .gitignore
├── requirements.txt
└── README.md
```

---

## Setup Instructions (for groupmates)

### 1. Clone the repository

```bash
git clone https://github.com/sMyleeeee/CapstoneProject---iPeek.git
cd CapstoneProject---iPeek
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv
```

**Windows (PowerShell):**
```powershell
venv\Scripts\Activate
```

**Mac/Linux:**
```bash
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Create your `.env` file

In the project root (`C:\ipeek` or wherever you cloned it), create a file named
`.env` with the following content:

```
GROQ_API_KEY=your_groq_api_key_here
SECRET_KEY=ipeek-dev-key
```

> Get a free Groq API key at https://console.groq.com
>
> **Never commit your `.env` file.** It's already in `.gitignore`.

### 5. Run the backend

From the project root (the folder containing `backend/`):

```bash
python -m backend.app
```

- First run will download the embedding model (bge-m3) and reranker model
  (bge-reranker-v2-m3) — this can take several minutes depending on your
  internet speed. Subsequent runs load from cache (~30-60s).
- The backend runs on **http://localhost:5000**
- All endpoints are under `/api/...` (e.g. `http://localhost:5000/api/status`)
- Visiting `http://localhost:5000/` directly will show a 404 — this is normal,
  since the backend is API-only.

### 6. Run the frontend

Open a **second terminal** (keep the backend running in the first), then:

```bash
cd frontend
python -m http.server 5500
```

Then open your browser to:

```
http://localhost:5500/index.html
```

---

## API Endpoints

| Method | Endpoint            | Description                          |
|--------|---------------------|---------------------------------------|
| POST   | `/api/ingest`       | Upload + ingest a PDF into ChromaDB   |
| POST   | `/api/similarity`   | Find top 3 similar studies            |
| POST   | `/api/summary`      | Generate AI summary of a proposal     |
| POST   | `/api/gaps`         | Identify research gaps                |
| POST   | `/api/chat`         | Conversational Q&A over the repository|
| GET    | `/api/documents`    | List all indexed documents            |
| GET    | `/api/status`       | Health check / chunk count            |

---

## Notes

- The `chroma_db/`, `papers/`, and `venv/` folders are **not** included in this
  repo (see `.gitignore`). They are generated/populated locally when you run
  the app and upload documents.
- The login page (`index.html`) currently uses mock authentication — any
  non-empty username/password works.
- Review queue (`review.html`) currently uses mock submission data — backend
  endpoints for submissions are not yet implemented.