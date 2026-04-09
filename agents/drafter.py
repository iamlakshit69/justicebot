# agents/drafter.py

import logging

from groq import Groq

from config import GROQ_API_KEY, MODELS, TEMPERATURE
from prompts.draft_prompts import DRAFT_PROMPTS, DRAFT_INSTRUCTION


logger = logging.getLogger(__name__)

# ── Valid Draft Types ─────────────────────────────────────────────────────────
# Mirrors the whitelist in app.py. The agent validates independently so it
# remains safe even if called directly outside of the Flask route.

VALID_DRAFT_TYPES = {"fir", "rti", "consumer", "notice"}


# ── Client ────────────────────────────────────────────────────────────────────
# FIX: Moved out of module scope.
# Module-level Groq() crashed the whole app on import if GROQ_API_KEY
# was missing or blank.

def _get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY)


# ── Drafter ───────────────────────────────────────────────────────────────────

def run_drafter(draft_type: str, context: dict) -> str:
    """
    Take a draft type and session context, run the 70B drafter model,
    and return a formatted legal document as a plain string.

    draft_type must be one of: fir, rti, consumer, notice
    context must contain:
        user_query, domain, key_facts, rights_summary, next_steps

    Never raises — returns a human-readable error string on failure
    so the frontend can display it gracefully instead of crashing.
    """

    # FIX: Corrected docstring — previously said "Gemma drafter model"
    # but config has always used llama-3.3-70b-versatile.

    # Sanitise draft_type — fall back to "notice" for unknown values
    draft_type = (draft_type or "").strip().lower()
    if draft_type not in VALID_DRAFT_TYPES:
        logger.warning(f"Drafter received unknown draft_type '{draft_type}' — defaulting to 'notice'.")
        draft_type = "notice"

    draft_prompt  = DRAFT_PROMPTS[draft_type]
    system_prompt = DRAFT_INSTRUCTION.strip() + "\n\n" + draft_prompt.strip()

    # Build context string from session data
    key_facts  = context.get("key_facts", [])
    next_steps = context.get("next_steps", [])

    facts_text      = "\n".join(f"- {f}" for f in key_facts)  if key_facts  else "- Not available."
    next_steps_text = "\n".join(f"- {s}" for s in next_steps) if next_steps else "- Not available."

    user_query     = str(context.get("user_query",     "")).strip()
    domain         = str(context.get("domain",         "")).strip().upper()
    rights_summary = str(context.get("rights_summary", "")).strip() or "Not available."

    user_message = (
        f"Please draft a {draft_type.upper()} document based on the following case details:\n\n"
        f"Original Query: {user_query}\n\n"
        f"Legal Domain: {domain}\n\n"
        f"Key Facts:\n{facts_text}\n\n"
        f"Legal Rights Summary:\n{rights_summary}\n\n"
        f"Recommended Next Steps:\n{next_steps_text}\n\n"
        "Draft the complete document now. Use placeholder brackets like [NAME], [ADDRESS], "
        "[DATE], [POLICE STATION] etc. wherever specific details are needed from the citizen."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message},
    ]

    try:
        client   = _get_client()
        response = client.chat.completions.create(
            model=MODELS["drafter"],
            temperature=TEMPERATURE["drafter"],
            messages=messages,
        )

        draft_text = response.choices[0].message.content.strip()

        if not draft_text:
            raise ValueError("Model returned an empty draft.")

        logger.info(f"Drafter → type={draft_type}  length={len(draft_text)} chars")
        return draft_text

    except Exception as e:
        logger.error(f"Drafter error: {e}", exc_info=True)
        return _fallback(draft_type, reason=str(e))


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(draft_type: str, reason: str = "") -> str:
    """
    Return a plain-text error message the frontend can display directly.
    Includes actionable guidance so the user is never left with a blank screen.
    """
    logger.warning(f"Drafter fallback triggered — type={draft_type}  reason: {reason}")
    return (
        f"Unable to generate the {draft_type.upper()} document at this time.\n\n"
        "Please try again in a moment. If the problem persists:\n"
        "  • Visit your nearest District Legal Services Authority (DLSA) for free document drafting assistance.\n"
        "  • Call the National Legal Services Authority helpline: 15100.\n\n"
        f"Technical detail: {reason}"
    )