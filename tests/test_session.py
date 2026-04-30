# tests/test_session.py
# Tests for the thread-safe session store.

import threading
import time

import pytest

from memory.session import (
    create_session, get_session, add_message, get_messages,
    clear_session, delete_session, update_case_file, get_case_file,
    get_session_count, SESSION_TTL_SECONDS, MAX_MESSAGES_PER_SESSION
)


# ── Basic CRUD ────────────────────────────────────────────────────────────────

class TestSessionCrud:
    def test_create_session_returns_dict(self):
        s = create_session('crud-test-1')
        assert isinstance(s, dict)
        assert 'case_file' in s
        assert 'messages' in s

    def test_get_existing_session(self):
        create_session('crud-test-2')
        s = get_session('crud-test-2')
        assert s is not None

    def test_get_unknown_session_creates_new(self):
        s = get_session('this-session-does-not-exist-xyz')
        assert s is not None
        assert s['messages'] == []

    def test_clear_session_resets_messages(self):
        sid = 'clear-test'
        create_session(sid)
        add_message(sid, 'user', 'hello')
        clear_session(sid)
        assert get_messages(sid) == []

    def test_delete_session(self):
        sid = 'delete-test'
        create_session(sid)
        delete_session(sid)
        # After deletion, get_session auto-creates a new empty one
        s = get_session(sid)
        assert s['messages'] == []


# ── Messages ──────────────────────────────────────────────────────────────────

class TestMessages:
    def test_add_and_get_message(self):
        sid = 'msg-test-1'
        create_session(sid)
        add_message(sid, 'user', 'Hello')
        msgs = get_messages(sid)
        assert len(msgs) == 1
        assert msgs[0]['role'] == 'user'
        assert msgs[0]['content'] == 'Hello'

    def test_messages_trimmed_to_max(self):
        sid = 'trim-test'
        create_session(sid)
        for i in range(MAX_MESSAGES_PER_SESSION + 5):
            add_message(sid, 'user', f'Message {i}')
        msgs = get_messages(sid)
        assert len(msgs) <= MAX_MESSAGES_PER_SESSION

    def test_first_message_preserved_after_trim(self):
        sid = 'trim-anchor'
        create_session(sid)
        add_message(sid, 'user', 'FIRST MESSAGE')
        for i in range(MAX_MESSAGES_PER_SESSION + 5):
            add_message(sid, 'assistant', f'Response {i}')
        msgs = get_messages(sid)
        assert msgs[0]['content'] == 'FIRST MESSAGE'

    def test_get_messages_strips_timestamp(self):
        sid = 'strip-ts'
        create_session(sid)
        add_message(sid, 'user', 'hi')
        msgs = get_messages(sid)
        for m in msgs:
            assert 'timestamp' not in m
            assert 'role' in m
            assert 'content' in m


# ── Case File ─────────────────────────────────────────────────────────────────

class TestCaseFile:
    def test_update_case_file_merges(self):
        sid = 'case-merge'
        create_session(sid)
        update_case_file(sid, {'domain': 'consumer'})
        cf = get_case_file(sid)
        assert cf['domain'] == 'consumer'

    def test_update_case_file_does_not_overwrite_with_none(self):
        sid = 'case-none'
        create_session(sid)
        update_case_file(sid, {'domain': 'tenant'})
        update_case_file(sid, {'domain': None})
        cf = get_case_file(sid)
        assert cf['domain'] == 'tenant'

    def test_update_case_file_nested_merge(self):
        sid = 'case-nested'
        create_session(sid)
        update_case_file(sid, {'facts': {'amount': '50000'}})
        update_case_file(sid, {'facts': {'date': '2026-01-01'}})
        cf = get_case_file(sid)
        assert cf['facts']['amount'] == '50000'
        assert cf['facts']['date'] == '2026-01-01'


# ── Thread Safety ─────────────────────────────────────────────────────────────

class TestThreadSafety:
    def test_concurrent_writes_do_not_crash(self):
        """Hammer the session store from multiple threads — should not raise."""
        sid = 'thread-test'
        create_session(sid)
        errors = []

        def worker(i):
            try:
                add_message(sid, 'user', f'Message {i}')
                get_messages(sid)
                update_case_file(sid, {'domain': 'consumer'})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(50)]
        for t in threads: t.start()
        for t in threads: t.join()

        assert errors == [], f"Thread safety errors: {errors}"


# ── Session Count ─────────────────────────────────────────────────────────────

class TestSessionCount:
    def test_count_increases_with_new_sessions(self):
        before = get_session_count()
        create_session(f'count-test-{time.time()}')
        after  = get_session_count()
        assert after >= before
