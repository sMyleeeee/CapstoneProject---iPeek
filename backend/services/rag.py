"""
rag.py
------
All 4 RAG analysis functions:
  1. get_similar_studies  — top 3 matching research
  2. get_summary          — how proposal relates to existing work
  3. get_research_gaps    — underexplored areas + recommendations
  4. chat                 — conversational Q&A grounded in repository

Each function follows the same pipeline:
  Query → ChromaDB (top 20) → Re-ranker (top 5) → Prompt + LLM → Response
"""

import logging
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

from backend.config import GROQ_API_KEY, LLM_MODEL, RETRIEVAL_TOP_K, SCORE_THRESHOLD
from backend.services.vectorstore import get_vectorstore
from backend.services.reranker import rerank

logger = logging.getLogger(__name__)

# LLM instance — loaded once, reused across all requests
llm    = ChatGroq(model=LLM_MODEL, api_key=GROQ_API_KEY, temperature=0.3)
parser = StrOutputParser()

# ── Prompts ───────────────────────────────────────────────────────────────────
# STRICT RULE in all prompts prevents the LLM from hallucinating
# outside sources not in the repository

SIMILAR_PROMPT = PromptTemplate.from_template("""
You are a research similarity analyst for ISAT-U.

STRICT RULE: Use ONLY the context below. Do NOT reference any study outside this context.
If nothing is relevant, say: "No similar studies found in the ISAT-U repository."

Context:
{context}

Proposal: {question}

List the top 3 most similar studies. For each:
- Title, Authors, Year, College
- Why it is similar (2-3 sentences)
- Similarity: HIGH / MODERATE / LOW
""")

SUMMARY_PROMPT = PromptTemplate.from_template("""
You are a research advisor at ISAT-U.

STRICT RULE: Use ONLY the context below. Do NOT use outside knowledge.
If nothing is relevant, say: "Not enough repository data to generate a summary."

Context:
{context}

Proposal: {question}

Write a 3-4 sentence summary covering:
1. How the proposal relates to existing ISAT-U research
2. What is already well-covered in the repository
3. What makes this proposal potentially unique
""")

GAPS_PROMPT = PromptTemplate.from_template("""
You are a research gap analyst for ISAT-U.

STRICT RULE: Identify gaps based ONLY on the context below.
If nothing is relevant, say: "Not enough repository data to identify gaps."

Context:
{context}

Proposal: {question}

Identify 3-5 research gaps. For each:
- Gap: One clear sentence
- Recommendation: How the proposal addresses it
- Urgency: HIGH / MEDIUM / LOW
""")

CHAT_PROMPT = PromptTemplate.from_template("""
You are a research assistant for ISAT-U students and faculty.

STRICT RULE: Answer ONLY from the context below.
If the answer is not there, say:
"That information is not in the ISAT-U repository. I can only answer from uploaded documents."

Context:
{context}

Question: {question}

Give a helpful, concise, academically appropriate answer. Cite studies from context when relevant.
""")


def _retrieve_and_rerank(query: str) -> list:
    """
    Two-stage retrieval:
      Stage 1 — ChromaDB cosine similarity (fast, fetches RETRIEVAL_TOP_K=20)
      Stage 2 — bge-reranker cross-encoder (accurate, returns top 5)

    Returns list of top Documents after re-ranking, or empty list if none found.
    """
    try:
        vs              = get_vectorstore()
        docs_and_scores = vs.similarity_search_with_relevance_scores(query, k=RETRIEVAL_TOP_K)

        # Filter below score threshold — removes clearly irrelevant chunks
        filtered = [doc for doc, score in docs_and_scores if score >= SCORE_THRESHOLD]
        logger.info(f"ChromaDB: {len(docs_and_scores)} retrieved, {len(filtered)} above threshold")

        if not filtered:
            return []

        return rerank(query, filtered)

    except Exception as e:
        logger.error(f"Retrieval error: {e}")
        return []


def _format_context(docs: list) -> str:
    """
    Formats Document objects into a readable context string for the LLM prompt.
    Deduplicates by title — one entry per paper even if multiple chunks matched.
    """
    if not docs:
        return "No relevant documents found in the repository."

    parts = []
    seen  = set()
    for doc in docs:
        title = doc.metadata.get("title", "Untitled")
        if title in seen:
            continue
        seen.add(title)
        parts.append(
            f"[{title} | {doc.metadata.get('authors','?')} | "
            f"{doc.metadata.get('year','?')} | {doc.metadata.get('college','?')}]\n"
            f"{doc.page_content}"
        )
    return "\n\n---\n\n".join(parts)


def _get_sources(docs: list) -> list:
    """Extracts unique source metadata for the frontend to display."""
    seen    = set()
    sources = []
    for doc in docs:
        title = doc.metadata.get("title", "Untitled")
        if title not in seen:
            seen.add(title)
            sources.append({
                "title":   title,
                "authors": doc.metadata.get("authors", "Unknown"),
                "year":    doc.metadata.get("year", "Unknown"),
                "college": doc.metadata.get("college", "Unknown"),
            })
    return sources


def _run(prompt: PromptTemplate, query: str) -> dict:
    """
    Executes the full RAG chain for any of the 4 analysis types.
    Returns { result: str, sources: list }
    """
    docs    = _retrieve_and_rerank(query)
    context = _format_context(docs)
    result  = (prompt | llm | parser).invoke({"context": context, "question": query})
    return {"result": result, "sources": _get_sources(docs)}


# ── Public functions called by Flask routes ───────────────────────────────────

def get_similar_studies(proposal: str) -> dict:
    """Finds top 3 similar studies to the submitted proposal."""
    logger.info(f"Similar studies: {proposal[:60]}")
    return _run(SIMILAR_PROMPT, proposal)


def get_summary(proposal: str) -> dict:
    """Summarizes how the proposal relates to existing repository work."""
    logger.info(f"Summary: {proposal[:60]}")
    return _run(SUMMARY_PROMPT, proposal)


def get_research_gaps(proposal: str) -> dict:
    """Identifies 3-5 research gaps based on proposal vs existing studies."""
    logger.info(f"Gaps: {proposal[:60]}")
    return _run(GAPS_PROMPT, proposal)


def chat(question: str) -> dict:
    """Answers a research question grounded strictly in repository documents."""
    logger.info(f"Chat: {question[:60]}")
    return _run(CHAT_PROMPT, question)
