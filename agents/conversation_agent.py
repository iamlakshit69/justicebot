# agents/conversation_agent.py

import json
import logging
import re

from groq import Groq

from config import GROQ_API_KEY, MODELS, TEMPERATURE
from prompts.conversation_prompt import CONVERSATION_SYSTEM_PROMPT


logger = logging.getLogger(__name__)


# ── Required keys in the AI response ─────────────────────────────────────────
REQUIRED_KEYS = {
    "message", "phase", "domain", "legal_sections",
    "case_strength", "draft_type", "draft_ready",
    "needs_professional", "action_chips", "case_updates",
}


# ── Client ────────────────────────────────────────────────────────────────────

def _get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY)


# ── JSON Extraction ──────────────────────────────────────────────────────────

def _extract_json(raw: str) -> dict:
    """
    Robustly extract a JSON object from model output.
    Handles: plain JSON, markdown-fenced JSON, JSON embedded in prose.
    """
    if not raw:
        raise json.JSONDecodeError("Empty response", "", 0)

    text = raw.strip()

    # Attempt 1: direct parse (model returned pure JSON)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Attempt 2: strip markdown code fences  ```json ... ``` or ``` ... ```
    fence_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Attempt 3: find the first { ... } block (greedy match for outermost braces)
    brace_match = re.search(r'\{.*\}', text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    # All attempts failed
    raise json.JSONDecodeError(
        f"No valid JSON found in model response (first 200 chars: {text[:200]!r})",
        text, 0
    )


# ── Conversation Agent ───────────────────────────────────────────────────────

def run_conversation(
    user_message: str,
    session_history: list,
    case_file: dict
) -> dict:
    """
    Single agent for all conversation turns.
    Takes the full session history and current case_file.
    Returns the full JSON response from the model.

    Never raises — returns safe fallback dict on any failure.
    """

    # 1. Build messages array
    messages = [
        {"role": "system", "content": CONVERSATION_SYSTEM_PROMPT},
    ]

    # 2. Inject current case_file as a hidden system context message
    messages.append({
        "role": "system",
        "content": "Current case file:\n" + json.dumps(case_file, indent=2)
    })

    # 3. Append full session history
    for turn in (session_history or []):
        messages.append(turn)

    # 4. Append user message
    messages.append({"role": "user", "content": user_message})

    try:
        # 5. Call the advisor model with JSON mode enforced
        client = _get_client()
        response = client.chat.completions.create(
            model=MODELS["advisor"],
            temperature=TEMPERATURE["advisor"],
            messages=messages,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content
        if not raw:
            logger.error("Conversation agent received empty content from model")
            return _fallback(reason="Model returned empty response")

        raw = raw.strip()
        logger.debug(f"Conversation agent raw response (first 300 chars): {raw[:300]!r}")

        result = _extract_json(raw)

        # Validate required keys
        missing_keys = REQUIRED_KEYS - result.keys()
        if missing_keys:
            logger.warning(f"Conversation agent response missing keys: {missing_keys} — filling defaults.")
            # Fill missing keys with defaults rather than failing
            defaults = _fallback()
            for key in missing_keys:
                result[key] = defaults[key]

        # Sanitise fields
        result["message"] = str(result.get("message", "")).strip()
        if not result["message"]:
            result["message"] = "I'm processing your request. Could you tell me more?"

        result["phase"] = str(result.get("phase", "GATHERING")).upper()
        if result["phase"] not in ("GATHERING", "ADVISING", "DRAFTING"):
            result["phase"] = "GATHERING"

        result["draft_ready"] = bool(result.get("draft_ready", False))
        result["needs_professional"] = bool(result.get("needs_professional", False))

        if not isinstance(result.get("legal_sections"), list):
            result["legal_sections"] = []
        result["legal_sections"] = [str(s).strip() for s in result["legal_sections"] if str(s).strip()]

        if not isinstance(result.get("action_chips"), list):
            result["action_chips"] = []
        result["action_chips"] = [str(c).strip() for c in result["action_chips"] if str(c).strip()]

        if not isinstance(result.get("case_updates"), dict):
            result["case_updates"] = {}

        logger.info(
            f"Conversation agent → phase={result['phase']}  "
            f"domain={result.get('domain')}  "
            f"draft_ready={result['draft_ready']}  "
            f"needs_professional={result['needs_professional']}"
        )

        return result

    except json.JSONDecodeError as e:
        logger.error(f"Conversation agent JSON parse error: {e}")
        return _fallback(reason=f"JSON parse error: {e}")

    except Exception as e:
        logger.error(f"Conversation agent error: {e}", exc_info=True)
        return _fallback(reason=str(e))


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(reason: str = "") -> dict:
    """Return a safe fallback response on any failure."""
    return {
        "message": "I'm having trouble processing that right now. Please try again in a moment.",
        "phase": "GATHERING",
        "domain": None,
        "legal_sections": [],
        "case_strength": None,
        "draft_type": None,
        "draft_ready": False,
        "needs_professional": False,
        "action_chips": ["Find Legal Help Nearby"],
        "case_updates": {},
        "error": reason
    }
