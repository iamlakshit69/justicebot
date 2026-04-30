# utils/json_helpers.py
# Shared JSON extraction utility — used by all agents.
# Previously this identical logic was duplicated in conversation_agent.py,
# section_explainer.py, and partially in doc_analyzer.py.

import json
import re


def extract_json(raw: str) -> dict:
    """
    Robustly extract a JSON object from model output.
    Handles: plain JSON, markdown-fenced JSON, JSON embedded in prose.

    Raises:
        json.JSONDecodeError — if no valid JSON can be extracted.
    """
    if not raw:
        raise json.JSONDecodeError("Empty response", "", 0)

    text = raw.strip()

    # Attempt 1: direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Attempt 2: strip markdown code fences  (```json ... ``` or ``` ... ```)
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

    raise json.JSONDecodeError(
        f"No valid JSON found in model response (first 200 chars: {text[:200]!r})",
        text, 0
    )
