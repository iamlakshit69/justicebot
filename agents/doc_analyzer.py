# agents/doc_analyzer.py

import json
import logging

from groq import Groq

from config import GROQ_API_KEY, MODELS, TEMPERATURE


logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# llama-3.1-70b-versatile supports 128k context tokens.
# At ~4 chars/token, 120k chars is a safe ceiling that leaves room
# for the system prompt and the model's response.
MAX_DOC_CHARS = 120_000

VALID_RISK_LEVELS = {"dangerous", "questionable", "safe"}

ANALYZER_PROMPT = """
You are a legal document analyst specialising in Indian law.
A citizen will provide text extracted from a legal document such as a rental agreement,
employment contract, sale deed, loan agreement, or any other legal document.

Your job is to:
1. Read through the entire document carefully
2. Identify every clause that could be risky, unfair, or problematic for the citizen
3. Flag each clause with a risk level

You must respond with valid JSON containing exactly this structure:
{
    "document_summary": "A 2-3 sentence plain English summary of what this document is",
    "total_clauses_reviewed": <integer>,
    "clauses": [
        {
            "clause_title": "Short name for this clause",
            "clause_text": "The actual problematic text from the document (truncated to 200 chars)",
            "risk_level": "dangerous" or "questionable" or "safe",
            "explanation": "Plain language explanation of why this clause is risky or notable",
            "recommendation": "What the citizen should do about this clause"
        }
    ]
}

Risk level definitions:
- dangerous:     Clause is clearly unfair, illegal, or heavily one-sided against the citizen
- questionable:  Clause needs clarification or negotiation before signing
- safe:          Clause is standard and acceptable

Return only valid JSON. No explanation outside the JSON object.
"""


# ── Client ────────────────────────────────────────────────────────────────────
# FIX: Moved out of module scope.
# Module-level Groq() crashed the whole app on import if GROQ_API_KEY
# was missing or blank.

def _get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY)


# ── Analyzer ──────────────────────────────────────────────────────────────────

def run_doc_analyzer(document_text: str) -> dict:
    """
    Take extracted text from an uploaded document, run the analyzer model,
    and return a list of flagged clauses with risk levels.

    Returns a dict with keys:
        document_summary        — plain-language summary of the document
        total_clauses_reviewed  — integer
        clauses                 — list of clause dicts

    Never raises — returns a safe fallback dict on any failure.
    """

    # FIX: Truncate at a word boundary instead of a hard character cut.
    # Cutting mid-sentence previously confused the model into treating the
    # truncation marker as part of the document text.
    if len(document_text) > MAX_DOC_CHARS:
        truncated = document_text[:MAX_DOC_CHARS]
        # Step back to the last whitespace so we don't cut mid-word
        last_space = truncated.rfind(" ")
        if last_space > MAX_DOC_CHARS * 0.9:   # only trim if near the end
            truncated = truncated[:last_space]
        document_text = truncated
        logger.info(f"Document truncated to {len(document_text)} chars for analysis.")

    user_message = (
        "Please analyse the following legal document and flag all clauses:\n\n"
        "--- DOCUMENT START ---\n"
        f"{document_text}\n"
        "--- DOCUMENT END ---"
    )

    messages = [
        {"role": "system", "content": ANALYZER_PROMPT},
        {"role": "user",   "content": user_message},
    ]

    try:
        client   = _get_client()
        response = client.chat.completions.create(
            model=MODELS["analyzer"],
            temperature=TEMPERATURE["analyzer"],
            messages=messages,
        )

        raw = response.choices[0].message.content.strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        # FIX: Replaced bare assert with explicit key validation.
        missing_keys = {"document_summary", "clauses"} - result.keys()
        if missing_keys:
            raise ValueError(f"Analyzer response missing required keys: {missing_keys}")

        # ── Sanitise output fields ────────────────────────────────────────────

        document_summary = str(result.get("document_summary", "")).strip()

        clauses = result.get("clauses", [])
        if not isinstance(clauses, list):
            clauses = []

        sanitised_clauses = []
        for clause in clauses:
            if not isinstance(clause, dict):
                continue

            # FIX: Enforce risk_level whitelist here too (defence-in-depth).
            # app.py also sanitises, but the agent should never return an
            # invalid value in the first place.
            risk_level = str(clause.get("risk_level", "safe")).strip().lower()
            if risk_level not in VALID_RISK_LEVELS:
                risk_level = "safe"

            sanitised_clauses.append({
                "clause_title":    str(clause.get("clause_title",    "Untitled Clause")).strip(),
                "clause_text":     str(clause.get("clause_text",     "")).strip()[:200],
                "risk_level":      risk_level,
                "explanation":     str(clause.get("explanation",     "")).strip(),
                "recommendation":  str(clause.get("recommendation",  "")).strip(),
            })

        # Prefer the model's count but recompute if it's missing or wrong type
        try:
            total = int(result.get("total_clauses_reviewed", len(sanitised_clauses)))
        except (TypeError, ValueError):
            total = len(sanitised_clauses)

        logger.info(
            f"Analyzer → clauses={len(sanitised_clauses)}  "
            f"dangerous={sum(1 for c in sanitised_clauses if c['risk_level'] == 'dangerous')}"
        )

        return {
            "document_summary":       document_summary,
            "total_clauses_reviewed": total,
            "clauses":                sanitised_clauses,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Analyzer JSON parse error: {e}  raw={raw!r:.200}")
        return _fallback(reason=f"JSON parse error: {e}")

    except ValueError as e:
        logger.error(f"Analyzer validation error: {e}")
        return _fallback(reason=str(e))

    except Exception as e:
        logger.error(f"Analyzer unexpected error: {e}", exc_info=True)
        return _fallback(reason=str(e))


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(reason: str = "") -> dict:
    logger.warning(f"Analyzer fallback triggered — reason: {reason}")
    return {
        "document_summary":       "Unable to analyse the document at this time. Please try again.",
        "total_clauses_reviewed": 0,
        "clauses":                [],
        "error":                  reason,
    }