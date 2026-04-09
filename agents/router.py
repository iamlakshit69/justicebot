# agents/router.py

import json
import logging

from groq import Groq

from config import GROQ_API_KEY, MODELS, TEMPERATURE
from prompts.legal_prompts import ROUTER_PROMPT


logger = logging.getLogger(__name__)

# ── Valid Domains ─────────────────────────────────────────────────────────────
# The router must return one of these. Any value outside this set is rejected
# and triggers the fallback — it never silently bleeds into advisor logic.

VALID_DOMAINS = {"consumer", "tenant", "labour", "rti", "criminal"}


# ── Client ────────────────────────────────────────────────────────────────────
# FIX: Client was previously instantiated at module level.
# If GROQ_API_KEY is missing, that caused an immediate crash on import,
# taking down the entire app before a single request was handled.
# Now created lazily inside the function — only fails at call time,
# and only for the request that actually needs it.

def _get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY)


# ── Router ────────────────────────────────────────────────────────────────────

def run_router(user_query: str, session_history: list | None = None) -> dict:
    """
    Classify the user's query into a legal domain, extract key facts,
    and return a confidence score.

    Returns a dict with keys:
        domain      — one of: consumer, tenant, labour, rti, criminal
        key_facts   — list of strings extracted from the query
        confidence  — integer 0–100

    Never raises — returns a safe fallback dict on any failure so the
    calling route can always continue to the advisor step.
    """

    if session_history is None:
        session_history = []

    messages = [{"role": "system", "content": ROUTER_PROMPT}]

    # Attach prior conversation turns for context
    for turn in session_history:
        messages.append(turn)

    messages.append({"role": "user", "content": user_query})

    try:
        client   = _get_client()
        response = client.chat.completions.create(
            model=MODELS["router"],
            temperature=TEMPERATURE["router"],
            messages=messages,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if the model adds them despite instructions
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        # ── Validate required keys ────────────────────────────────────────────
        # FIX: Replaced bare assert statements with explicit checks.
        # assert is disabled silently when Python runs with the -O flag,
        # letting malformed model responses propagate as broken dicts
        # and corrupting all downstream advisor logic.

        missing_keys = {"domain", "key_facts", "confidence"} - result.keys()
        if missing_keys:
            raise ValueError(f"Router response missing required keys: {missing_keys}")

        # ── Validate domain value ─────────────────────────────────────────────
        # FIX: Previously the fallback domain was hardcoded to "criminal".
        # A network hiccup or bad JSON would silently route a tenant dispute
        # or RTI request to criminal law advice with no indication of failure.
        # Now we validate the returned domain and fall through to the explicit
        # fallback below if the model returns something unexpected.

        domain = str(result.get("domain", "")).strip().lower()
        if domain not in VALID_DOMAINS:
            logger.warning(f"Router returned unknown domain '{domain}' — using fallback.")
            raise ValueError(f"Unknown domain: '{domain}'")

        # ── Validate key_facts ────────────────────────────────────────────────
        key_facts = result.get("key_facts", [])
        if not isinstance(key_facts, list):
            key_facts = [str(key_facts)]

        # Sanitise each fact to a plain string, drop empties
        key_facts = [str(f).strip() for f in key_facts if str(f).strip()]

        # ── Validate confidence ───────────────────────────────────────────────
        try:
            confidence = int(result.get("confidence", 0))
            confidence = max(0, min(100, confidence))   # clamp to [0, 100]
        except (TypeError, ValueError):
            confidence = 0

        logger.info(f"Router classified → domain={domain}  confidence={confidence}%  facts={len(key_facts)}")

        return {
            "domain":     domain,
            "key_facts":  key_facts,
            "confidence": confidence,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Router JSON parse error: {e}  raw={raw!r:.200}")
        return _fallback(user_query, reason=f"JSON parse error: {e}")

    except ValueError as e:
        logger.error(f"Router validation error: {e}")
        return _fallback(user_query, reason=str(e))

    except Exception as e:
        logger.error(f"Router unexpected error: {e}", exc_info=True)
        return _fallback(user_query, reason=str(e))


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(user_query: str, reason: str = "") -> dict:
    """
    Safe fallback returned whenever the router fails for any reason.

    domain is set to None (not "criminal") so the advisor and app layer
    can detect the failure explicitly and handle it — for example by showing
    the user a domain-selection prompt instead of silently giving wrong advice.

    confidence=0 signals to the frontend that classification failed so it
    can show a warning rather than presenting the result with false authority.
    """
    logger.warning(f"Router fallback triggered — reason: {reason}")
    return {
        "domain":     None,
        "key_facts":  [user_query] if user_query else [],
        "confidence": 0,
        "error":      reason,
    }