# tests/test_conversation_agent.py
# Tests for the conversation agent — JSON extraction, sanitisation, fallback.

import json
import pytest
from unittest.mock import MagicMock, patch

from utils.json_helpers import extract_json
from agents.conversation_agent import _sanitise, _fallback, run_conversation


# ── _extract_json ─────────────────────────────────────────────────────────────

class TestExtractJson:
    def test_pure_json(self):
        raw = '{"message": "Hello", "phase": "GATHERING"}'
        result = extract_json(raw)
        assert result["message"] == "Hello"
        assert result["phase"] == "GATHERING"

    def test_markdown_fenced_json(self):
        raw = '```json\n{"message": "test"}\n```'
        result = extract_json(raw)
        assert result["message"] == "test"

    def test_markdown_fenced_no_lang(self):
        raw = '```\n{"message": "test"}\n```'
        result = extract_json(raw)
        assert result["message"] == "test"

    def test_json_embedded_in_prose(self):
        raw = 'Here is my response:\n{"message": "embedded"}\nSome trailing text'
        result = extract_json(raw)
        assert result["message"] == "embedded"

    def test_empty_string_raises(self):
        with pytest.raises(json.JSONDecodeError):
            extract_json("")

    def test_none_raises(self):
        with pytest.raises(json.JSONDecodeError):
            extract_json(None)

    def test_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            extract_json("this is not json at all")

    def test_whitespace_stripped(self):
        raw = '   {"message": "padded"}   '
        result = extract_json(raw)
        assert result["message"] == "padded"


# ── _sanitise ─────────────────────────────────────────────────────────────────

class TestSanitise:
    def _base(self, **overrides):
        base = {
            "message":            "Hello",
            "phase":              "GATHERING",
            "domain":             None,
            "legal_sections":     [],
            "case_strength":      None,
            "draft_type":         None,
            "draft_ready":        False,
            "needs_professional": False,
            "action_chips":       [],
            "case_updates":       {},
        }
        base.update(overrides)
        return base

    def test_valid_passes_through(self):
        result = _sanitise(self._base())
        assert result["phase"] == "GATHERING"

    def test_invalid_phase_normalised(self):
        result = _sanitise(self._base(phase="UNKNOWN"))
        assert result["phase"] == "GATHERING"

    def test_phase_uppercased(self):
        result = _sanitise(self._base(phase="advising"))
        assert result["phase"] == "ADVISING"

    def test_draft_ready_coerced_to_bool(self):
        result = _sanitise(self._base(draft_ready=1))
        assert result["draft_ready"] is True

    def test_needs_professional_coerced_to_bool(self):
        result = _sanitise(self._base(needs_professional="yes"))
        assert result["needs_professional"] is True

    def test_legal_sections_as_list(self):
        result = _sanitise(self._base(legal_sections="Section 420, IPC"))
        assert result["legal_sections"] == []

    def test_legal_sections_filtered(self):
        result = _sanitise(self._base(legal_sections=["Section 420", "", "  "]))
        assert result["legal_sections"] == ["Section 420"]

    def test_missing_keys_filled_with_defaults(self):
        result = _sanitise({"message": "Partial"})
        assert "phase"           in result
        assert "legal_sections"  in result
        assert "case_updates"    in result

    def test_empty_message_filled(self):
        result = _sanitise(self._base(message="   "))
        assert result["message"] != ""

    def test_case_updates_non_dict_replaced(self):
        result = _sanitise(self._base(case_updates="bad"))
        assert result["case_updates"] == {}


# ── _fallback ────────────────────────────────────────────────────────────────

class TestFallback:
    def test_fallback_has_all_required_keys(self):
        fb = _fallback()
        from agents.conversation_agent import REQUIRED_KEYS
        assert REQUIRED_KEYS.issubset(fb.keys())

    def test_fallback_includes_reason(self):
        fb = _fallback(reason="test error")
        assert fb["error"] == "test error"

    def test_fallback_phase_is_gathering(self):
        fb = _fallback()
        assert fb["phase"] == "GATHERING"


# ── run_conversation (integration with mock) ──────────────────────────────────

class TestRunConversation:
    def _make_mock_response(self, content: str):
        msg  = MagicMock()
        msg.content = content
        choice = MagicMock()
        choice.message = msg
        resp   = MagicMock()
        resp.choices = [choice]
        return resp

    @patch('agents.conversation_agent.chat_completion')
    def test_valid_response_returned(self, mock_chat_fn):
        payload = json.dumps({
            "message":            "You have a strong case.",
            "phase":              "ADVISING",
            "domain":             "consumer",
            "legal_sections":     ["Section 2, Consumer Protection Act 2019"],
            "case_strength":      "Strong",
            "draft_type":         None,
            "draft_ready":        False,
            "needs_professional": False,
            "action_chips":       ["Draft a Legal Notice"],
            "case_updates":       {},
        })
        mock_chat_fn.return_value = self._make_mock_response(payload)

        result = run_conversation("My landlord won't return my deposit", [], {})

        assert result["phase"]  == "ADVISING"
        assert result["domain"] == "consumer"
        assert "Section 2" in result["legal_sections"][0]

    @patch('agents.conversation_agent.chat_completion')
    def test_empty_response_returns_fallback(self, mock_chat_fn):
        mock_chat_fn.return_value = self._make_mock_response("")

        result = run_conversation("test", [], {})
        assert result["phase"] == "GATHERING"
        assert "error" in result

    @patch('agents.conversation_agent.chat_completion')
    def test_malformed_json_returns_fallback(self, mock_chat_fn):
        mock_chat_fn.return_value = self._make_mock_response("not json!!!")

        result = run_conversation("test", [], {})
        assert result["phase"] == "GATHERING"
        assert "error" in result

    @patch('agents.conversation_agent.chat_completion')
    def test_api_error_returns_fallback(self, mock_chat_fn):
        mock_chat_fn.side_effect = Exception("Network error")

        result = run_conversation("test", [], {})
        assert result["phase"] == "GATHERING"
