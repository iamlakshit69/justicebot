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
    "advisor":  "llama-3.3-70b-versatile",      # best quality — legal reasoning
    "analyzer": "llama-3.1-70b-versatile",      # large context — document analysis (replaces deprecated mixtral)
    "drafter":  "llama-3.3-70b-versatile",      # best quality — document drafting
}


# ── Temperatures ──────────────────────────────────────────────────────────────
# Lower = more deterministic. Legal outputs should be consistent, not creative.

TEMPERATURE = {
    "router":   0.0,    # must be deterministic — wrong domain = wrong advice
    "advisor":  0.2,    # slight variation allowed for natural language output
    "analyzer": 0.1,    # near-deterministic — clause risk levels must be consistent
    "drafter":  0.4,    # slightly more creative for readable document drafting
}


# ── Server ────────────────────────────────────────────────────────────────────

APP_TITLE    = "JusticeBot"
APP_SUBTITLE = "Free legal guidance for every citizen"
HOST         = os.getenv("HOST", "0.0.0.0")
PORT         = int(os.getenv("PORT", 8080))

# FIX: DEBUG was hardcoded to True, which enables the Werkzeug interactive
# debugger and exposes full stack traces to users in production.
# Now read from the environment — defaults to False if not explicitly set.
DEBUG = os.getenv("DEBUG", "false").lower() == "true"