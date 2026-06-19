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

PAGE CITATIONS:
Every chunk now carries metadata["page"] (set during per-page ingestion in
ingestor.py). The LLM is instructed to cite the page a claim came from as
(p. X), and (p. X, p. Y) when it synthesizes one idea across multiple pages.
The LLM may paraphrase and connect ideas in its own words — citations are
only required for actual factual claims traceable to the context, not for
connective/transition sentences.
"""

import logging
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

from config import GROQ_API_KEY, LLM_MODEL, RETRIEVAL_TOP_K, SCORE_THRESHOLD
from services.vectorstore import get_vectorstore
from services.reranker import rerank

logger = logging.getLogger(__name__)

# LLM instance — loaded once, reused across all requests
llm    = ChatGroq(model=LLM_MODEL, api_key=GROQ_API_KEY, temperature=0.3)
parser = StrOutputParser()

# ── Shared citation instruction ────────────────────────────────────────────────
# Appended to all 4 prompts below. Kept as one constant so the citation rule
# stays identical across every RAG function instead of drifting between them.
CITATION_RULE = """
CITATION RULE: You may synthesize, paraphrase, and connect ideas across the
context in your own words — you are not limited to copying sentences. However,
every factual claim must be traceable to a specific page shown in the context
above. Cite the page inline immediately after the claim, formatted as (p. X).
If one idea draws from multiple pages, cite all of them together,
e.g. (p. 12, p. 24). Do NOT invent page numbers that are not shown in the
context. Do NOT cite a page for your own connective or transitional sentences
(e.g. "This suggests that...") — only cite pages for claims that come from the
source material.
"""

# ── Prompts ───────────────────────────────────────────────────────────────────
# STRICT RULE in all prompts prevents the LLM from hallucinating
# outside sources not in the repository. CITATION_RULE is appended to each
# so every claim is traceable to a real page.

SIMILAR_PROMPT = PromptTemplate.from_template("""
You are a research similarity analyst for ISAT-U.

STRICT RULE: Use ONLY the context below. Do NOT reference any study outside this context.
If nothing is relevant, say: "No similar studies found in the ISAT-U repository."

""" + CITATION_RULE + """

Context:
{context}

Proposal: {question}

List the top 3 most similar studies. For each:
- Title, Authors, Year, College
- Why it is similar (2-3 sentences, with page citations for specific claims)
- Similarity: HIGH / MODERATE / LOW
""")

SUMMARY_PROMPT = PromptTemplate.from_template("""
You are a research advisor at ISAT-U.

STRICT RULE: Use ONLY the context below. Do NOT use outside knowledge.
If nothing is relevant, say: "Not enough repository data to generate a summary."

""" + CITATION_RULE + """

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

""" + CITATION_RULE + """

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

""" + CITATION_RULE + """

Context:
{context}

Conversation so far:
{history}

Current question: {question}

Give a helpful, concise, academically appropriate answer.
If the conversation history is relevant, use it to give a more coherent response.
Cite studies from context when relevant.
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

    IMPORTANT: Dedupes by (title, page) — NOT by title alone. Deduping by
    title alone would silently drop chunks from the same paper that came
    from different pages, which breaks page citations (the LLM would only
    ever see one page per paper, even when the re-ranker correctly retrieved
    content from several).

    Each entry is tagged with its page number so the LLM can cite it.
    """
    if not docs:
        return "No relevant documents found in the repository."

    parts = []
    seen  = set()
    for doc in docs:
        title = doc.metadata.get("title", "Untitled")
        page  = doc.metadata.get("page", "?")

        # Dedupe by (title, page) so multiple chunks from the same page
        # don't repeat, but different pages of the same paper both survive.
        key = (title, page)
        if key in seen:
            continue
        seen.add(key)

        parts.append(
            f"[{title} | {doc.metadata.get('authors','?')} | "
            f"{doc.metadata.get('year','?')} | {doc.metadata.get('college','?')} | "
            f"Page {page}]\n"
            f"{doc.page_content}"
        )
    return "\n\n---\n\n".join(parts)


def _get_sources(docs: list) -> list:
    """
    Extracts unique source metadata for the frontend to display
    (e.g. the "Similar Projects" sidebar on the detail page).

    Deduped by title only here (unlike _format_context) — the frontend
    wants one card per PAPER, not one card per page. Page numbers cited
    within that paper are collected into a list so the UI can show
    something like "Pages 12, 24" if it wants to.
    """
    seen    = {}
    for doc in docs:
        title = doc.metadata.get("title", "Untitled")
        page  = doc.metadata.get("page", None)

        if title not in seen:
            seen[title] = {
                "title":   title,
                "authors": doc.metadata.get("authors", "Unknown"),
                "year":    doc.metadata.get("year", "Unknown"),
                "college": doc.metadata.get("college", "Unknown"),
                "pages":   [],
            }
        if page is not None and page not in seen[title]["pages"]:
            seen[title]["pages"].append(page)

    # Sort pages ascending per source for a clean frontend display
    sources = list(seen.values())
    for s in sources:
        s["pages"].sort()

    return sources


def _run(prompt: PromptTemplate, query: str, history: str = "") -> dict:
    """
    Executes the full RAG chain for any of the 4 analysis types.
    Returns { result: str, sources: list }

    history is only used by chat() — the other 3 prompts don't include {history}
    so we build the invoke dict conditionally.
    """
    docs    = _retrieve_and_rerank(query)
    context = _format_context(docs)

    invoke_input = {"context": context, "question": query}
    if history is not None and history != "":
        invoke_input["history"] = history or "No prior conversation."

    result = (prompt | llm | parser).invoke(invoke_input)
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


def chat(question: str, history: list = None) -> dict:
    """
    Answers a research question grounded strictly in repository documents.

    Args:
        question: The current user question
        history:  List of prior turns, each a dict with 'role' and 'content'.
                  e.g. [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]
                  Empty list or None means first turn (no prior context).

    Returns:
        { result: str, sources: list }
    """
    logger.info(f"Chat: {question[:60]}")

    # Format history into a readable string for the prompt
    history_text = ""
    if history:
        lines = []
        for turn in history:
            role    = "Student" if turn.get("role") == "user" else "Assistant"
            content = turn.get("content", "").strip()
            if content:
                lines.append(f"{role}: {content}")
        history_text = "\n".join(lines)

    return _run(CHAT_PROMPT, question, history=history_text)