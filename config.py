# config.py

import os
from dotenv import load_dotenv

load_dotenv()


# ── API Keys ──────────────────────────────────────────────────────────────────

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


# ── Models ────────────────────────────────────────────────────────────────────
# FIX: mixtral-8x7b-32768 was decommissioned by Groq and caused HTTP 400
# on every doc analyzer call. Replaced with llama-3.1-70b-versatile which
# also has a large context window (128k) suitable for long document analysis.

MODELS = {
    "router":   "llama-3.1-8b-instant",        # fast, lightweight — classification only
    "advisor":  "llama-3.1-8b-instant",        # best quality — legal reasoning
    "analyzer": "llama-3.1-8b-instant",        # large context — document analysis (replaces deprecated mixtral)
    "drafter":  "llama-3.1-8b-instant",        # best quality — document drafting
}


# ── Temperatures ──────────────────────────────────────────────────────────────
# Lower = more deterministic. Legal outputs should be consistent, not creative.

TEMPERATURE = {
    "router":   0.0,    # must be deterministic — wrong domain = wrong advice
    "advisor":  0.2,    # slight variation allowed for natural language output
    "analyzer": 0.1,    # near-deterministic — clause risk levels must be consistent
    "drafter":  0.4,    # slightly more creative for readable document drafting
}


# ── Max Output Tokens ────────────────────────────────────────────────────────
# Caps output length per model role. Prevents the model from generating
# endlessly and hitting Groq's hard token limit (which truncates mid-JSON).

MAX_TOKENS = {
    "router":   1024,   # short classification responses
    "advisor":  3000,   # legal analysis — reduced from 4096 to stay under Groq free-tier 6k TPM
                        # (system prompt is ~2100 tokens, so 3000 output = ~5100 total, safely under limit)
    "analyzer": 4096,   # document analysis with multiple clauses
    "drafter":  8192,   # legal documents can be long
}


# ── LLM Timeout ──────────────────────────────────────────────────────────────
# Seconds to wait for a Groq API response before aborting.
# Prevents hung requests from blocking Flask threads indefinitely.

LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))


# ── Server ────────────────────────────────────────────────────────────────────

APP_TITLE    = "JusticeBot"
APP_SUBTITLE = "Free legal guidance for every citizen"
HOST         = os.getenv("HOST", "0.0.0.0")
PORT         = int(os.getenv("PORT", 8080))

# FIX: DEBUG was hardcoded to True, which enables the Werkzeug interactive
# debugger and exposes full stack traces to users in production.
# Now read from the environment — defaults to False if not explicitly set.
DEBUG = os.getenv("DEBUG", "false").lower() == "true"