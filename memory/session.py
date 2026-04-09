# memory/session.py

import time
from datetime import datetime, timezone


# ── Constants ─────────────────────────────────────────────────────────────────

# Maximum number of concurrent sessions held in memory.
# When this cap is reached the oldest session is evicted (LRU).
# Prevents unbounded RAM growth from a session-flood DoS attack.
MAX_SESSIONS = 500

# Sessions older than this (in seconds) are expired and removed.
# 2 hours is enough for a complete legal consultation workflow.
SESSION_TTL_SECONDS = 60 * 60 * 2      # 2 hours

# Maximum number of conversation turns kept per session.
# Prevents a single long session from growing the model context indefinitely
# until the API returns a token-limit error.
MAX_MESSAGES_PER_SESSION = 20


# ── Internal Store ────────────────────────────────────────────────────────────
# Plain dict keyed by session_id.
# Each value is the session dict plus a "_last_accessed" float timestamp
# used for TTL checks and LRU eviction.
#
# NOTE: This is an in-process store — suitable for single-worker deployments.
# For multi-worker gunicorn, replace with a Redis backend so all workers
# share the same session state. See README for migration notes.

_sessions: dict[str, dict] = {}


# ── Internal Helpers ──────────────────────────────────────────────────────────

def _now_ts() -> float:
    """Return the current UTC time as a float timestamp."""
    return time.time()


def _is_expired(session: dict) -> bool:
    """Return True if the session has exceeded SESSION_TTL_SECONDS."""
    return _now_ts() - session.get("_last_accessed", 0) > SESSION_TTL_SECONDS


def _touch(session: dict) -> None:
    """Update the last-accessed timestamp to keep the session alive."""
    session["_last_accessed"] = _now_ts()


def _evict_expired() -> None:
    """Remove all sessions that have exceeded the TTL."""
    expired = [sid for sid, s in _sessions.items() if _is_expired(s)]
    for sid in expired:
        del _sessions[sid]


def _evict_oldest() -> None:
    """
    Remove the single least-recently-used session.
    Called when MAX_SESSIONS is reached to make room for a new one.
    """
    if not _sessions:
        return
    oldest_id = min(_sessions, key=lambda sid: _sessions[sid].get("_last_accessed", 0))
    del _sessions[oldest_id]


def _make_session(session_id: str) -> dict:
    """Return a fresh, empty session dict."""
    return {
        "messages":        [],
        "last_query":      None,
        "last_domain":     None,
        "last_key_facts":  [],
        "last_result":     {},
        "last_document":   None,
        "created_at":      datetime.now(timezone.utc).isoformat(),
        "_last_accessed":  _now_ts(),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def create_session(session_id: str) -> dict:
    """
    Create (or reset) a session for the given ID.
    Runs expired-entry cleanup and enforces the MAX_SESSIONS cap
    before inserting the new session.
    """
    # Sweep expired sessions first — free space before enforcing the hard cap
    _evict_expired()

    # If still at capacity after TTL sweep, evict the LRU session
    if len(_sessions) >= MAX_SESSIONS and session_id not in _sessions:
        _evict_oldest()

    _sessions[session_id] = _make_session(session_id)
    return _sessions[session_id]


def get_session(session_id: str) -> dict:
    """
    Return the session for the given ID.
    Creates a fresh one if the ID is unknown or has expired.
    Touches the last-accessed timestamp on every read.
    """
    session = _sessions.get(session_id)

    if session is None or _is_expired(session):
        return create_session(session_id)

    _touch(session)
    return session


def update_session(session_id: str, key: str, value) -> None:
    """Set an arbitrary key on the session dict."""
    session = get_session(session_id)
    session[key] = value
    _touch(session)


def add_message(session_id: str, role: str, content: str) -> None:
    """
    Append a message to the session's conversation history.
    Enforces MAX_MESSAGES_PER_SESSION by dropping the oldest messages
    (excluding the very first turn so context origin is always preserved).
    """
    session = get_session(session_id)

    session["messages"].append({
        "role":      role,
        "content":   content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # Trim from the second message onwards to stay within the cap.
    # We keep messages[0] (the first user turn) so the model always has
    # the original query as an anchor for the whole conversation.
    if len(session["messages"]) > MAX_MESSAGES_PER_SESSION:
        first   = session["messages"][:1]
        trimmed = session["messages"][-(MAX_MESSAGES_PER_SESSION - 1):]
        session["messages"] = first + trimmed

    _touch(session)


def get_messages(session_id: str) -> list[dict]:
    """
    Return the conversation history in the format expected by the Groq API:
    a list of {"role": ..., "content": ...} dicts, with internal metadata stripped.
    """
    session = get_session(session_id)
    return [
        {"role": m["role"], "content": m["content"]}
        for m in session["messages"]
    ]


def clear_session(session_id: str) -> None:
    """Reset the session to a clean state, preserving the session ID."""
    _sessions[session_id] = _make_session(session_id)


def delete_session(session_id: str) -> None:
    """Fully remove a session from the store."""
    _sessions.pop(session_id, None)


def get_session_count() -> int:
    """Return the number of live (non-expired) sessions. Useful for monitoring."""
    _evict_expired()
    return len(_sessions)