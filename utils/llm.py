# utils/llm.py
# Centralised LLM client — singleton Groq instance with connection pooling,
# retry on transient failures, and configurable timeouts.
#
# Previously every agent created a new Groq() on each call, which meant:
# - No HTTP connection reuse (new TCP handshake every time)
# - No retry on transient 503/429 errors
# - No timeout protection (hung requests blocked Flask threads forever)

import time
import logging

from groq import Groq

from config import GROQ_API_KEY, LLM_TIMEOUT


logger = logging.getLogger(__name__)

# ── Singleton Client ──────────────────────────────────────────────────────────
# A single Groq instance is reused across all requests, giving us HTTP
# connection pooling via the underlying httpx client.

_client: Groq | None = None


def get_client() -> Groq:
    """Return the singleton Groq client (lazy-initialised)."""
    global _client
    if _client is None:
        if not GROQ_API_KEY:
            raise EnvironmentError(
                "GROQ_API_KEY is not set. "
                "Add it to your .env file locally, or to Vercel/Render Environment Variables in production."
            )
        _client = Groq(api_key=GROQ_API_KEY, timeout=LLM_TIMEOUT)
    return _client


# ── Retry-enabled Chat Completion ─────────────────────────────────────────────

def chat_completion(
    *,
    model: str,
    temperature: float,
    messages: list,
    max_tokens: int = 4096,
    response_format: dict | None = None,
    stream: bool = False,
    max_retries: int = 2,
):
    """
    Call Groq chat.completions.create with automatic retry on transient errors.

    Args:
        model, temperature, messages: standard Groq params.
        max_tokens:      caps output length — prevents truncated JSON.
        response_format: e.g. {"type": "json_object"}.
        stream:          if True, returns a streaming iterator.
        max_retries:     total attempts (1 = no retry, 2 = one retry).

    Returns:
        The raw Groq response (or stream iterator).

    Raises:
        The last exception if all retries are exhausted.
    """
    client = get_client()

    kwargs: dict = {
        "model": model,
        "temperature": temperature,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format
    if stream:
        kwargs["stream"] = True

    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                wait = min(2 ** (attempt - 1), 4)   # 1 s, 2 s, cap at 4 s
                logger.warning(
                    f"LLM call failed [{type(e).__name__}] (attempt {attempt}/{max_retries}), "
                    f"retrying in {wait}s: {e}"
                )
                time.sleep(wait)
            else:
                logger.error(
                    f"LLM call failed [{type(e).__name__}] after {max_retries} attempt(s): {e}",
                    exc_info=True,
                )

    raise last_error  # type: ignore[misc]
