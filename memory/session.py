# memory/session.py

import copy
import time
import threading
from datetime import datetime, timezone


# ── Constants ─────────────────────────────────────────────────────────────────

# Maximum number of concurrent sessions held in memory.
# When this cap is reached the oldest session is evicted (LRU).
MAX_SESSIONS = 500

# Sessions older than this (in seconds) are expired and removed.
SESSION_TTL_SECONDS = 60 * 60 * 2      # 2 hours

# Maximum number of conversation turns kept per session.
# Prevents the model context from growing until the API hits a token-limit error.
MAX_MESSAGES_PER_SESSION = 20


# ── Internal Store ────────────────────────────────────────────────────────────
# Plain dict keyed by session_id.
# FIXED: Protected by a threading.Lock so concurrent Flask threads/workers
# cannot corrupt the store via simultaneous reads and writes.
#
# NOTE: This is an in-process store — suitable for single-worker deployments.
# For multi-process gunicorn, replace with a Redis backend so all workers
# share the same session state.

_sessions: dict[str, dict] = {}
_lock = threading.Lock()


# ── Internal Helpers ──────────────────────────────────────────────────────────

def _now_ts() -> float:
    return time.time()


def _is_expired(session: dict) -> bool:
    return _now_ts() - session.get("_last_accessed", 0) > SESSION_TTL_SECONDS


def _touch(session: dict) -> None:
    session["_last_accessed"] = _now_ts()


def _evict_expired_unsafe() -> None:
    """Must be called while holding _lock."""
    expired = [sid for sid, s in _sessions.items() if _is_expired(s)]
    for sid in expired:
        del _sessions[sid]


def _evict_oldest_unsafe() -> None:
    """Remove the single LRU session. Must be called while holding _lock."""
    if not _sessions:
        return
    oldest_id = min(_sessions, key=lambda sid: _sessions[sid].get("_last_accessed", 0))
    del _sessions[oldest_id]


def _make_session(session_id: str) -> dict:
    """Return a fresh, empty session dict with the v2 case_file structure."""
    return {
        "messages": [],
        "case_file": {
            "domain":          None,
            "phase":           "GATHERING",
            "facts":           {},
            "parties": {
                "claimant":        None,
                "claimant_addr":   None,
                "respondent":      None,
                "respondent_addr": None,
            },
            "amounts":         {},
            "dates":           {},
            "documents_held":  [],
            "draft_type":      None,
            "advice_given":    False,
            "questions_asked": [],
        },
        "created_at":     datetime.now(timezone.utc).isoformat(),
        "_last_accessed": _now_ts(),
    }


# ── Case File Helpers ─────────────────────────────────────────────────────────

def merge_case_file(existing: dict, updates: dict) -> dict:
    """Merge AI-returned updates into the existing case file.
    Never overwrites a non-None value with None.
    Dicts are merged recursively. Lists are replaced.
    """
    for key, val in updates.items():
        if val is None:
            continue
        if isinstance(val, dict) and isinstance(existing.get(key), dict):
            merge_case_file(existing[key], val)
        else:
            existing[key] = val
    return existing


def get_case_file(session_id: str) -> dict:
    """Return a deep copy of the case file — safe to read without lock concerns."""
    with _lock:
        session = _get_session_unsafe(session_id)
        return copy.deepcopy(session["case_file"])


def update_case_file(session_id: str, updates: dict) -> None:
    with _lock:
        session = _get_session_unsafe(session_id)
        merge_case_file(session["case_file"], updates)
        _touch(session)


# ── Private (lock-free) helpers used internally ───────────────────────────────

def _get_session_unsafe(session_id: str) -> dict:
    """Get or create a session without acquiring the lock (caller must hold it)."""
    session = _sessions.get(session_id)
    if session is None or _is_expired(session):
        _evict_expired_unsafe()
        if len(_sessions) >= MAX_SESSIONS and session_id not in _sessions:
            _evict_oldest_unsafe()
        _sessions[session_id] = _make_session(session_id)
        return _sessions[session_id]
    _touch(session)
    return session


# ── Public API ────────────────────────────────────────────────────────────────

def create_session(session_id: str) -> dict:
    with _lock:
        _evict_expired_unsafe()
        if len(_sessions) >= MAX_SESSIONS and session_id not in _sessions:
            _evict_oldest_unsafe()
        _sessions[session_id] = _make_session(session_id)
        return copy.deepcopy(_sessions[session_id])


def get_session(session_id: str) -> dict:
    """Return a deep copy of the session — callers cannot accidentally
    mutate the internal store without going through the lock."""
    with _lock:
        return copy.deepcopy(_get_session_unsafe(session_id))


def update_session(session_id: str, key: str, value) -> None:
    with _lock:
        session = _get_session_unsafe(session_id)
        session[key] = value
        _touch(session)


def add_message(session_id: str, role: str, content: str) -> None:
    with _lock:
        session = _get_session_unsafe(session_id)
        session["messages"].append({
            "role":      role,
            "content":   content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        # Trim: keep first message as anchor + most recent N-1
        if len(session["messages"]) > MAX_MESSAGES_PER_SESSION:
            first   = session["messages"][:1]
            trimmed = session["messages"][-(MAX_MESSAGES_PER_SESSION - 1):]
            session["messages"] = first + trimmed
        _touch(session)


def get_messages(session_id: str) -> list[dict]:
    with _lock:
        session = _get_session_unsafe(session_id)
        return [
            {"role": m["role"], "content": m["content"]}
            for m in session["messages"]
        ]


def clear_session(session_id: str) -> None:
    with _lock:
        _sessions[session_id] = _make_session(session_id)


def delete_session(session_id: str) -> None:
    with _lock:
        _sessions.pop(session_id, None)


def get_session_count() -> int:
    with _lock:
        _evict_expired_unsafe()
        return len(_sessions)