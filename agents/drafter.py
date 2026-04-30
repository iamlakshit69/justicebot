# agents/drafter.py

import logging

from config import MODELS, TEMPERATURE, MAX_TOKENS
from utils.llm import chat_completion
from prompts.draft_prompts import DRAFT_SYSTEM_PROMPT, build_draft_user_message


logger = logging.getLogger(__name__)

# ── Valid Draft Types ─────────────────────────────────────────────────────────
# Mirrors the whitelist in app.py. The agent validates independently so it
# remains safe even if called directly outside of the Flask route.

VALID_DRAFT_TYPES = {"fir", "rti", "consumer", "notice"}


# ── Drafter ───────────────────────────────────────────────────────────────────

def run_drafter(draft_type: str, case_file: dict) -> str:
    """
    Take a draft type and session case_file, run the 70B drafter model,
    and return a fully filled legal document as a plain string.

    draft_type must be one of: fir, rti, consumer, notice
    case_file must be the full structured case_file from the session.

    Never raises — returns a human-readable error string on failure
    so the frontend can display it gracefully instead of crashing.
    """

    # Sanitise draft_type — fall back to "notice" for unknown values
    draft_type = (draft_type or "").strip().lower()
    if draft_type not in VALID_DRAFT_TYPES:
        logger.warning(f"Drafter received unknown draft_type '{draft_type}' — defaulting to 'notice'.")
        draft_type = "notice"

    # v2: Use the case-file-driven prompt system
    system_prompt = DRAFT_SYSTEM_PROMPT.strip()
    user_message = build_draft_user_message(draft_type, case_file)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message},
    ]

    try:
        response = chat_completion(
            model=MODELS["drafter"],
            temperature=TEMPERATURE["drafter"],
            messages=messages,
            max_tokens=MAX_TOKENS["drafter"],
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