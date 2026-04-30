# agents/conversation_agent.py

import json
import logging
import re
from typing import Generator

from config import MODELS, TEMPERATURE, MAX_TOKENS
from utils.json_helpers import extract_json
from utils.llm import chat_completion
from prompts.conversation_prompt import CONVERSATION_SYSTEM_PROMPT


logger = logging.getLogger(__name__)


# ── Required keys in the AI response ─────────────────────────────────────────
REQUIRED_KEYS = {
    "message", "phase", "domain", "legal_sections",
    "case_strength", "draft_type", "draft_ready",
    "needs_professional", "action_chips", "case_updates",
}

# Extended keys — populated only in ADVISING phase; safe to be absent
EXTENDED_KEYS = {
    "case_strength_score", "case_strength_factors",
    "opponent_arguments", "evidence_checklist",
    "timeline", "filing_info",
}


# ── Message Builder ───────────────────────────────────────────────────────────

def _build_messages(user_message: str, session_history: list, case_file: dict) -> list:
    """Build the messages array to send to the model."""
    messages = [
        {"role": "system", "content": CONVERSATION_SYSTEM_PROMPT},
        {"role": "system", "content": "Current case file:\n" + json.dumps(case_file, indent=2)},
    ]
    for turn in (session_history or []):
        messages.append(turn)
    messages.append({"role": "user", "content": user_message})
    return messages


# ── Result Sanitiser ──────────────────────────────────────────────────────────

def _sanitise(result: dict) -> dict:
    """Validate & normalise all fields of the model response."""
    defaults = _fallback()

    # Fill any missing required keys
    missing_keys = REQUIRED_KEYS - result.keys()
    if missing_keys:
        logger.warning(f"Response missing keys: {missing_keys} — filling defaults.")
        for key in missing_keys:
            result[key] = defaults[key]

    result["message"] = str(result.get("message", "")).strip()
    if not result["message"]:
        result["message"] = "I'm processing your request. Could you tell me more?"

    result["phase"] = str(result.get("phase", "GATHERING")).upper()
    if result["phase"] not in ("GATHERING", "ADVISING", "DRAFTING"):
        result["phase"] = "GATHERING"

    result["draft_ready"]         = bool(result.get("draft_ready", False))
    result["needs_professional"]  = bool(result.get("needs_professional", False))

    if not isinstance(result.get("legal_sections"), list):
        result["legal_sections"] = []
    result["legal_sections"] = [str(s).strip() for s in result["legal_sections"] if str(s).strip()]

    if not isinstance(result.get("action_chips"), list):
        result["action_chips"] = []
    result["action_chips"] = [str(c).strip() for c in result["action_chips"] if str(c).strip()]

    if not isinstance(result.get("case_updates"), dict):
        result["case_updates"] = {}

    # ── Extended fields (ADVISING phase enrichments) ──────────────────────
    # case_strength_score: int 1-10
    score = result.get("case_strength_score")
    if score is not None:
        try:
            result["case_strength_score"] = max(1, min(10, int(score)))
        except (ValueError, TypeError):
            result["case_strength_score"] = None
    else:
        result["case_strength_score"] = None

    # case_strength_factors: list of strings
    if not isinstance(result.get("case_strength_factors"), list):
        result["case_strength_factors"] = []
    result["case_strength_factors"] = [str(f).strip() for f in result["case_strength_factors"] if str(f).strip()]

    # opponent_arguments: list of {argument, counter}
    if not isinstance(result.get("opponent_arguments"), list):
        result["opponent_arguments"] = []
    result["opponent_arguments"] = [
        a for a in result["opponent_arguments"]
        if isinstance(a, dict) and a.get("argument") and a.get("counter")
    ]

    # evidence_checklist: list of {item, category, status}
    if not isinstance(result.get("evidence_checklist"), list):
        result["evidence_checklist"] = []
    result["evidence_checklist"] = [
        e for e in result["evidence_checklist"]
        if isinstance(e, dict) and e.get("item")
    ]

    # timeline: list of {step, when, detail}
    if not isinstance(result.get("timeline"), list):
        result["timeline"] = []
    result["timeline"] = [
        t for t in result["timeline"]
        if isinstance(t, dict) and t.get("step")
    ]

    # filing_info: dict or null
    if not isinstance(result.get("filing_info"), dict):
        result["filing_info"] = None

    logger.info(
        f"Conversation agent → phase={result['phase']}  "
        f"domain={result.get('domain')}  "
        f"draft_ready={result['draft_ready']}  "
        f"strength={result.get('case_strength_score')}  "
        f"needs_professional={result['needs_professional']}"
    )
    return result


# ── Non-streaming (fallback) ──────────────────────────────────────────────────

def run_conversation(
    user_message: str,
    session_history: list,
    case_file: dict
) -> dict:
    """
    Single agent for all conversation turns (non-streaming).
    Returns the full JSON response dict.
    Never raises — returns safe fallback on any failure.
    """
    messages = _build_messages(user_message, session_history, case_file)

    try:
        response = chat_completion(
            model=MODELS["advisor"],
            temperature=TEMPERATURE["advisor"],
            messages=messages,
            max_tokens=MAX_TOKENS["advisor"],
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content
        if not raw:
            return _fallback(reason="Model returned empty response")

        result = extract_json(raw.strip())
        return _sanitise(result)

    except json.JSONDecodeError as e:
        logger.error(f"Conversation agent JSON parse error: {e}")
        return _fallback(reason=f"JSON parse error: {e}")

    except Exception as e:
        logger.error(f"Conversation agent error: {e}", exc_info=True)
        return _fallback(reason=str(e))


# ── Progressive Message Extraction ───────────────────────────────────────────

# Regex to find the start of the "message" value in partial JSON
_MSG_PREFIX_RE = re.compile(r'"message"\s*:\s*"')


def _extract_partial_message(buffer: str) -> str | None:
    """
    Try to extract the partial 'message' value from a growing JSON buffer.
    Properly handles JSON escape sequences (\\n, \\", \\\\, etc.).
    Returns None if the "message" key hasn't appeared yet.
    """
    match = _MSG_PREFIX_RE.search(buffer)
    if not match:
        return None

    start = match.end()
    result = []
    i = start
    while i < len(buffer):
        ch = buffer[i]
        if ch == '\\' and i + 1 < len(buffer):
            next_ch = buffer[i + 1]
            if next_ch == '"':
                result.append('"')
            elif next_ch == 'n':
                result.append('\n')
            elif next_ch == 't':
                result.append('\t')
            elif next_ch == '\\':
                result.append('\\')
            else:
                result.append(next_ch)
            i += 2
        elif ch == '"':
            # End of the "message" string value
            break
        else:
            result.append(ch)
            i += 1

    return ''.join(result)


# ── Streaming ────────────────────────────────────────────────────────────────

def stream_conversation(
    user_message: str,
    session_history: list,
    case_file: dict
) -> Generator[tuple[str, object], None, None]:
    """
    Streaming version of run_conversation.
    Yields (event_type, payload) tuples:
      - ('delta', str)   — a chunk of the message to show live
      - ('done', dict)   — the full sanitised result dict

    Strategy (improved): uses Groq's json_object mode + stream=True.
    As tokens arrive, we progressively extract the "message" field value
    from the partial JSON buffer and emit new characters as deltas.
    This gives REAL streaming — the user sees text appearing as the model
    generates it, not a fake word-by-word animation after buffering.

    Once the stream completes, we parse the full JSON, sanitise it, and
    emit the 'done' event. The frontend then re-renders the raw streamed
    text with proper formatting (section headers, bold, etc.).
    """
    messages = _build_messages(user_message, session_history, case_file)

    try:
        stream = chat_completion(
            model=MODELS["advisor"],
            temperature=TEMPERATURE["advisor"],
            messages=messages,
            max_tokens=MAX_TOKENS["advisor"],
            response_format={"type": "json_object"},
            stream=True,
        )

        # Buffer all tokens for final JSON parse, but emit message deltas
        # progressively as the "message" field grows.
        full_text = ""
        emitted_len = 0

        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            full_text += delta

            # Try to extract the partial "message" value from the buffer
            partial_msg = _extract_partial_message(full_text)
            if partial_msg and len(partial_msg) > emitted_len:
                new_text = partial_msg[emitted_len:]
                emitted_len = len(partial_msg)
                yield ('delta', new_text)

        if not full_text.strip():
            yield ('done', _fallback(reason="Model returned empty response"))
            return

        # Parse the complete JSON
        result = extract_json(full_text.strip())
        result = _sanitise(result)

        # If progressive extraction didn't work (e.g. "message" key was last),
        # fall back to word-by-word emission of the full message.
        if emitted_len == 0 and result.get("message"):
            message = result["message"]
            words = message.split(" ")
            for i, word in enumerate(words):
                chunk_text = word + (" " if i < len(words) - 1 else "")
                yield ('delta', chunk_text)

        yield ('done', result)

    except json.JSONDecodeError as e:
        logger.error(f"stream_conversation JSON parse error: {e}")
        yield ('done', _fallback(reason=f"JSON parse error: {e}"))

    except Exception as e:
        logger.error(f"stream_conversation error: {e}", exc_info=True)
        yield ('done', _fallback(reason=str(e)))


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(reason: str = "") -> dict:
    """Return a safe fallback response on any failure."""
    return {
        "message":            "I'm having trouble processing that right now. Please try again in a moment.",
        "phase":              "GATHERING",
        "domain":             None,
        "legal_sections":     [],
        "case_strength":      None,
        "draft_type":         None,
        "draft_ready":        False,
        "needs_professional": False,
        "action_chips":       ["Find Legal Help Nearby"],
        "case_updates":       {},
        "error":              reason,
    }
