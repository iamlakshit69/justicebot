# agents/legal_advisor.py

import json
import logging

from groq import Groq

from config import GROQ_API_KEY, MODELS, TEMPERATURE
from prompts.legal_prompts import DOMAIN_PROMPTS


logger = logging.getLogger(__name__)

# Fallback domain used when an unrecognised domain is passed in.
# "criminal" is the broadest catch-all in Indian law so it is the
# safest default for the advisor specifically (unlike the router,
# where None is correct — here we must always produce legal output).
_FALLBACK_DOMAIN = "criminal"


# ── Client ────────────────────────────────────────────────────────────────────
# FIX: Moved out of module scope.
# Module-level Groq() crashed the whole app on import if GROQ_API_KEY
# was missing. Now instantiated lazily per call.

def _get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY)


# ── Advisor ───────────────────────────────────────────────────────────────────

def run_advisor(
    user_query: str,
    domain: str | None,
    key_facts: list,
    session_history: list | None = None,
) -> dict:
    """
    Take the classified domain and key facts from the router,
    run the 70B legal advisor model with the domain-specific prompt,
    and return structured legal advice.

    Returns a dict with keys:
        rights_summary  — plain-language explanation of the citizen's rights
        legal_sections  — list of relevant law sections
        case_strength   — integer 0–100
        next_steps      — list of recommended actions

    Never raises — returns a safe fallback dict on any failure.
    """

    if session_history is None:
        session_history = []

    # FIX: domain=None is now a valid input (router fallback).
    # Resolve it to a safe default before picking the system prompt.
    resolved_domain = (domain or "").strip().lower()
    if resolved_domain not in DOMAIN_PROMPTS:
        logger.warning(f"Advisor received unknown domain '{domain}' — falling back to '{_FALLBACK_DOMAIN}'.")
        resolved_domain = _FALLBACK_DOMAIN

    system_prompt = DOMAIN_PROMPTS[resolved_domain]

    # Build enriched query from key facts
    facts_text = "\n".join(f"- {fact}" for fact in key_facts) if key_facts else "- No key facts extracted."

    enriched_query = (
        f"User Query: {user_query}\n\n"
        f"Key Facts Extracted:\n{facts_text}\n\n"
        f"Legal Domain: {resolved_domain.upper()}\n\n"
        "Please analyse this situation and provide legal guidance."
    )

    messages = [{"role": "system", "content": system_prompt}]

    for turn in session_history:
        messages.append(turn)

    messages.append({"role": "user", "content": enriched_query})

    try:
        client   = _get_client()
        response = client.chat.completions.create(
            model=MODELS["advisor"],
            temperature=TEMPERATURE["advisor"],
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
        # assert is silently disabled under Python -O, letting malformed
        # responses propagate as incomplete dicts into session memory
        # and downstream PDF/draft generation.
        missing_keys = {"rights_summary", "legal_sections", "case_strength", "next_steps"} - result.keys()
        if missing_keys:
            raise ValueError(f"Advisor response missing required keys: {missing_keys}")

        # Sanitise each field to the expected type
        rights_summary = str(result.get("rights_summary", "")).strip()

        legal_sections = result.get("legal_sections", [])
        if not isinstance(legal_sections, list):
            legal_sections = [str(legal_sections)]
        legal_sections = [str(s).strip() for s in legal_sections if str(s).strip()]

        try:
            case_strength = int(result.get("case_strength", 0))
            case_strength = max(0, min(100, case_strength))
        except (TypeError, ValueError):
            case_strength = 0

        next_steps = result.get("next_steps", [])
        if not isinstance(next_steps, list):
            next_steps = [str(next_steps)]
        next_steps = [str(s).strip() for s in next_steps if str(s).strip()]

        logger.info(
            f"Advisor → domain={resolved_domain}  "
            f"sections={len(legal_sections)}  strength={case_strength}%"
        )

        return {
            "rights_summary": rights_summary,
            "legal_sections": legal_sections,
            "case_strength":  case_strength,
            "next_steps":     next_steps,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Advisor JSON parse error: {e}  raw={raw!r:.200}")
        return _fallback(reason=f"JSON parse error: {e}")

    except ValueError as e:
        logger.error(f"Advisor validation error: {e}")
        return _fallback(reason=str(e))

    except Exception as e:
        logger.error(f"Advisor unexpected error: {e}", exc_info=True)
        return _fallback(reason=str(e))


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(reason: str = "") -> dict:
    logger.warning(f"Advisor fallback triggered — reason: {reason}")
    return {
        "rights_summary": "Unable to process your query at this time. Please try again or contact a legal aid office.",
        "legal_sections": [],
        "case_strength":  0,
        "next_steps":     [
            "Visit your nearest District Legal Services Authority (DLSA) for free legal aid.",
            "Call the National Legal Services Authority helpline: 15100.",
        ],
        "error": reason,
    }