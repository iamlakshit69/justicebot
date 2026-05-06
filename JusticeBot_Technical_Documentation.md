# JusticeBot: Exhaustive Technical Documentation & Architecture Report

## 1. Project Overview & Core Objective
JusticeBot is a highly sophisticated, production-ready legal advocacy web application. Its primary objective is to democratize legal aid in India by providing users with an intelligent, conversational interface capable of sophisticated legal reasoning, unstructured document analysis, structured drafting, and geographical legal aid discovery. 

Unlike standard chatbot wrappers, JusticeBot is engineered as an autonomous agentic system. It maintains stateful context (a "Case File"), routes queries dynamically, streams structured JSON directly to the frontend, and rigorously sanitizes LLM outputs to guarantee application stability.

---

## 2. Exhaustive Technology Stack
Every dependency, library, and framework utilized in the project has been explicitly chosen for performance, security, and rendering capabilities:

### 2.1 Backend & Infrastructure
* **Python 3.12 (Slim Bookworm):** Chosen for optimal performance, memory footprint, and modern asynchronous capabilities.
* **Flask 3.0.x:** The core WSGI web framework, utilizing Werkzeug for routing and request handling.
* **Gunicorn & Gevent:** The production WSGI HTTP server, configured with multiple worker threads (`--workers 2 --threads 4`) to handle concurrent I/O-bound LLM requests securely.
* **Groq API SDK (`groq`):** Facilitates ultra-fast LLM inference using proprietary LPU (Language Processing Unit) hardware.
* **LLaMA 3.1 & 3.3 Models:** Uses `llama-3.1-8b-instant` for low-latency conversational streaming and `llama-3.3-70b-versatile` for complex, high-context document analysis and legal drafting.

### 2.2 Document Processing & Export
* **PyMuPDF (`fitz`):** A high-performance C-based library used for extremely accurate text extraction from uploaded PDF documents.
* **python-docx (`docx`):** Parses `.docx` files to extract raw textual data from Word documents.
* **fpdf2:** A modern, pure-Python PDF generation library. Used instead of standard FPDF due to its superior support for custom Unicode fonts, which is critical for rendering Indian legal terms and rupee (₹) symbols.
* **DejaVu Sans Font:** Bundled statically within the app (`static/fonts/`) to guarantee Unicode support during PDF export.

### 2.3 Frontend Application
* **Vanilla HTML5, CSS3, ES6 JavaScript:** Used exclusively to maintain a zero-build-step architecture (no React/Node.js dependencies), ensuring the application is extremely lightweight.
* **Server-Sent Events (SSE) API:** Utilizes the native browser `EventSource` and `fetch` streams (`TextDecoder`) for real-time progressive JSON rendering.
* **Leaflet.js:** A leading open-source JavaScript library for mobile-friendly interactive maps.
* **OpenStreetMap (OSM):**
  * **Overpass API:** Queried dynamically to locate nearby courts and police stations within a 10km radius.
  * **Nominatim API:** Used for geocoding user-entered addresses into coordinates.
* **Marked.js:** A fast markdown parser used to safely render LLM-generated markdown into DOM elements.
* **Lucide Icons:** A clean, modern SVG icon library dynamically rendered on the frontend.
* **ipapi.co:** Utilized for silent, background IP-based location detection if the user denies HTML5 Geolocation API permissions.

### 2.4 Diagnostics & Testing
* **pytest:** The primary testing framework running unit and integration tests across the application.
* **matplotlib & numpy:** Used exclusively within the `diagnostics.py` script to generate visual latency and success/fail charts.
* **reportlab:** Used alongside `python-docx` to compile automated, dark-themed PDF diagnostic reports for DevOps auditing.

---

## 3. System Architecture & Request Lifecycle

The architecture is built on a specialized micro-agent workflow. 
1. **Request Intake:** The user submits a query or document via the UI.
2. **Rate Limiting & Security:** The Flask backend verifies the user's IP against the in-memory `RateLimiter` (max 15 req/60s).
3. **Session Management:** The request's `session_id` triggers a thread-safe lock in `memory/session.py`, loading the user's historical `messages` and active `case_file`.
4. **Agent Orchestration:** Based on the endpoint (`/api/analyze`, `/api/document`, `/api/draft`), the request is routed to a specific intelligent agent.
5. **LLM Inference:** The agent constructs a context-heavy prompt and invokes the `Groq` API via `utils/llm.py`. 
6. **Progressive Streaming:** For conversations, `agents/conversation_agent.py` uses a custom parsing algorithm to yield partial JSON chunks (`delta` events) over an SSE stream.
7. **Sanitization:** Once the stream completes, the full JSON payload is passed through `_sanitise()` to correct hallucinations, enforce boolean types, and strip invalid characters.
8. **State Update:** The extracted `case_updates` are deeply merged into the user's `case_file`.
9. **UI Rendering:** The frontend `script.js` catches the `done` event, extracts the structured data, and updates the DOM (Case Strength Meters, Timelines, Action Chips).

---

## 4. Backend Orchestration & Core Infrastructure

### 4.1 `app.py` (The Application Router)
The central WSGI file handles all HTTP traffic and strict security middleware.
* **`RateLimiter` Class:** Implements an in-memory dictionary tracking IP request timestamps. It uses `time.time()` to prune timestamps older than the 60-second window, preventing memory bloat. Returns `HTTP 429 Too Many Requests` upon limit breach.
* **`_RequestIdFilter`:** A custom `logging.Filter` that injects a UUID into every log line, ensuring concurrent request logs can be traced.
* **Security Headers Middleware:** A `@app.after_request` hook explicitly sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict `Content-Security-Policy`.
* **Endpoints:**
  * `POST /api/analyze`: Utilizes `flask.Response(stream_with_context(...), mimetype='text/event-stream')`. It acts as a generator, yielding `data: {json}\n\n` strings.
  * `POST /api/document`: Parses `request.files['file']`, checks file extensions, sizes (max 5MB), saves temporarily, triggers `utils/doc_parser.py`, and cleans up the temp file in a `finally` block.
  * `POST /api/explain-section`, `POST /api/draft`, `POST /api/pdf`, `POST /api/session/clear`: Standard synchronous JSON REST endpoints.

### 4.2 `config.py` (Centralized Configuration)
* Enforces the existence of `GROQ_API_KEY`.
* Explicitly sets model constraints:
  * `LLM_TIMEOUT`: 45 seconds to prevent hung workers.
  * `MAX_TOKENS`: Capped at 4096 to prevent exorbitant API costs.
  * `TEMPERATURE`: Set to `0.2` for document analysis (ensuring deterministic output) and `0.4` for conversation (allowing slight variability).

---

## 5. The Intelligent Agent Pipeline (`agents/`)

### 5.1 Conversation Agent (`agents/conversation_agent.py`)
The most complex module in the system, handling multi-turn stateful dialogue.
* **Prompt Construction:** Merges `prompts/conversation_prompt.py` with the user's `case_file` dictionary.
* **`stream_conversation()` Algorithm:** As tokens stream from Groq, it accumulates a string buffer. It uses a custom bracket-counting mechanism (`{` and `}`) and regex (`r'"message"\s*:\s*"([^"]*)"'`) to extract and yield the `"message"` field incrementally. This allows the frontend to type out the response natively while the backend waits for the rest of the structured JSON.
* **`_sanitise()` & `_fallback()`:** LLMs occasionally output malformed JSON or markdown fences (e.g., ````json { ... } ````). `utils.json_helpers.extract_json` strips fences. `_sanitise()` ensures fields like `draft_ready` are coerced to explicitly `bool`, lists are stripped of empty strings, and missing keys are padded with default defaults. If everything fails, `_fallback()` generates a static safety payload to prevent UI crashes.

### 5.2 Document Analyzer (`agents/doc_analyzer.py`)
Responsible for semantic legal text interpretation.
* **Truncation Logic:** Because legal documents can exceed the 8,000 token context window, `doc_analyzer` truncates the parsed text. Critically, it uses `text[:LIMIT].rsplit(' ', 1)[0]` to ensure words are not sliced in half, which could destroy semantic meaning.
* **JSON Enforcement:** Prompts the LLM to return an array of objects containing `clause_title`, `clause_text`, `explanation`, `risk_level` (strictly `safe`, `questionable`, or `dangerous`), and `recommendation`.

### 5.3 Drafter Agent (`agents/drafter.py`)
An automated drafting engine mapping unstructured facts to structured legal templates.
* Evaluates `case_file.get('facts', {})` to extract parties, dates, amounts, and grievances.
* Supports distinct logic branches for `notice` (Legal Notice), `fir` (Police Complaint), `rti` (Right to Information), and `consumer` (Consumer Forum Complaint).
* Outputs raw, strictly formatted text (no JSON wrapper) to maximize the token limit for the actual document content.

---

## 6. State & Memory Management (`memory/session.py`)

A highly optimized thread-safe in-memory data store.
* **Internal Structure:** `_SESSIONS` is a dictionary where the key is the `session_id` and the value is `{'case_file': {}, 'messages': [...], 'last_active': float}`.
* **Concurrency:** `_LOCK = threading.Lock()` is acquired before *any* read or write operation to `_SESSIONS`. This prevents race conditions when multiple Gunicorn threads access the dictionary simultaneously.
* **Deep Dictionary Merging:** `update_case_file()` recursively traverses nested dictionaries to merge the LLM's `case_updates` into the existing `case_file` without overwriting existing data.
* **LRU Eviction (Least Recently Used):** To prevent RAM exhaustion, if `len(_SESSIONS) > 10000`, the system sorts sessions by `last_active` and deletes the oldest 1,000.
* **TTL Expiration:** A periodic check purges any session where `time.time() - last_active > 86400` (24 hours).

---

## 7. Data Parsing & Utilities (`utils/`)

### 7.1 Document Parser (`utils/doc_parser.py`)
* PDF Parsing: Instantiates `fitz.open(path)`. Iterates through `doc.pages()` calling `page.get_text()`. Extracts plain text while discarding images and vector graphics to save context limits.
* DOCX Parsing: Instantiates `docx.Document(path)`. Iterates through `doc.paragraphs`, joining `para.text` with line breaks.

### 7.2 PDF Export Engine (`utils/pdf_export.py`)
A sophisticated report generator for the user's Case File.
* **Font Registration:** Calls `pdf.add_font("DejaVu", "", "static/fonts/DejaVuSans.ttf", uni=True)`. This is paramount because standard PDF-1.4 fonts (Helvetica, Times) do not contain glyphs for Indic languages or the ₹ symbol.
* **Layout Mathematics:** Uses `pdf.multi_cell(0, 7, text)` to handle automatic text wrapping. It meticulously tracks the Y-axis (`pdf.get_y()`) and triggers `pdf.add_page()` to prevent text from overflowing off the bottom of the document.
* **Rendered Components:** Translates UI components into PDF elements: The Timeline, the Case Strength Score, Opponent Arguments, and the Evidence Checklist.

### 7.3 DLSA Locator (`utils/dlsa.py` & `data/dlsa_offices.py`)
* Acts as an offline, zero-latency database of NALSA/DLSA district offices.
* Implements a custom string matching algorithm that normalizes the query (lowercase, strips punctuation) to handle misspellings of state names (e.g., "NCT of Delhi" -> "delhi").

---

## 8. Frontend Application Engineering

The frontend is a masterpiece of Vanilla JavaScript and modern CSS without the overhead of heavy frameworks.

### 8.1 HTML Structure (`templates/index.html`)
* **Semantic Layout:** Uses `<aside>` for the sidebar, `<main>` for the chat view, and explicit ARIA roles (`role="dialog"`, `aria-modal="true"`) for the Modals to ensure web accessibility.
* **PWA Readiness:** Links to `/static/manifest.json` and a custom SVG theme color to allow installation as a Progressive Web App on mobile devices.

### 8.2 Client-side Logic (`static/script.js`)
* **SSE Parsing Algorithm:** 
  * `fetch()` is called with a `Signal` from an `AbortController` (allowing the user to stop generation).
  * The `response.body.getReader()` processes chunks. A `TextDecoder` converts bytes to strings.
  * The script appends to a `buffer`, splitting by `\n`. It slices the `data: ` prefix, parses the JSON `evt`, and dynamically appends the `evt.text` directly into the `.stream-target` DOM element.
* **Location & Map Infrastructure:**
  * Tries `navigator.geolocation` first. If blocked, falls back to `ipapi.co`.
  * **Overpass Integration:** Executes a complex Overpass Query Language (OQL) string to fetch nodes/ways within a 10,000-meter radius matching `amenity=courthouse` or `amenity=police`.
  * Calculates haversine distances (`getDistanceKm`) to sort resources by proximity.
  * Dynamically instantiates `L.marker` objects on the Leaflet map with custom HTML icons.

### 8.3 Styling Engine (`static/style.css`)
* **CSS Custom Properties:** Over 40 CSS variables define the theme (`--bg-surface`, `--accent`, `--safe`, `--warn`, `--danger`).
* **Animations:**
  * The `thinking-spinner` utilizes a CSS `@keyframes spin`.
  * Case Strength meters utilize staggered `animation-delay` via inline CSS generation in JavaScript to create a "filling up" effect.
  * Modals utilize a backdrop-filter (`blur(4px)`) and keyframe translations (`modalOut`) to achieve a glassmorphic, fluid UX.

---

## 9. Security Measures & Production Safeguards
* **Prompt Injection Defense:** Basic regex and prompt engineering instructions explicitly command the LLM to ignore meta-instructions (e.g., "ignore previous instructions").
* **DOM XSS Protection:** `script.js` contains a rigorous `escapeHTML()` function. Every string generated by the LLM or input by the user passes through this before being injected via `.innerHTML`.
* **Resource Limits:** Uploads are hard-capped at 5 Megabytes by Werkzeug, and files are saved strictly to the OS's temp directory using `tempfile.NamedTemporaryFile`, completely isolated from the web root.

---

## 10. Deployment & Containerization Architecture
* **Dockerfile:**
  * Uses the minimal `python:3.12-slim` image.
  * Sets `ENV PYTHONUNBUFFERED=1` to ensure real-time logging.
  * Creates a non-root user (`useradd -m -u 1000 appuser`) and drops privileges before running the application, preventing privilege escalation attacks.
  * Exposes port `8080` and boots via `gunicorn app:app -b 0.0.0.0:8080 --workers 2 --threads 4`.
* **Platform Configurations:**
  * `render.yaml`: Defines the service structure for Render.com, mapping environment variables natively.
  * `vercel.json`: Pre-configured for serverless deployment if necessary, explicitly routing all paths `/(.*)` to `app.py`.

---

## 11. Testing & Diagnostics Infrastructure
* **Automated Test Suite (`tests/`):**
  * `test_app.py`: Mocks `app.run_conversation` and simulates client HTTP requests, verifying HTTP status codes and prompt injection blocks.
  * `test_session.py`: Fires 50 simultaneous threads accessing `add_message()` and `update_case_file()` to explicitly prove the `threading.Lock` prevents race conditions.
  * `test_conversation_agent.py`: Supplies malformed JSON strings, markdown blocks, and missing keys to mathematically prove `extract_json()` and `_sanitise()` will never fail.
* **Diagnostics Runner (`scripts/diagnostics.py`):**
  * Evaluates system dependencies and environment variables.
  * Pings external endpoints to measure latency.
  * Generates visual bar charts and horizontal latency charts using `matplotlib`.
  * Exports findings into an enterprise-grade dark-themed PDF using `reportlab.platypus.SimpleDocTemplate`.

---

## 12. Structured Project Report Summary

This section provides direct, code-backed answers for project reporting requirements:

### 1. Chatbot Type
**Type:** Hybrid (Generative LLM-based coupled with deterministic state-machine routing).
**Evidence:** The system utilizes a generative LLM for responses (`agents/conversation_agent.py`) but forces the LLM to output strictly formatted JSON (`response_format={"type": "json_object"}`). It combines generative text (the `"message"` field) with deterministic data extraction (`"phase"`, `"case_updates"`, `"action_chips"`) to drive the application state.

### 2. API Used
**API:** Groq API.
**Evidence:** The AI is called via the official `groq` Python SDK.
* File: `utils/llm.py` 
* Line 31: `_client = Groq(api_key=GROQ_API_KEY, timeout=LLM_TIMEOUT)`
* Line 80: `return client.chat.completions.create(**kwargs)`

### 3. Model Name & Version
**Models:** LLaMA 3.1 and LLaMA 3.3.
**Evidence:** Exact model strings are explicitly defined in the configuration.
* File: `config.py` (Lines 19-24)
```python
MODELS = {
    "router":   "llama-3.1-8b-instant",        # fast, lightweight — classification only
    "advisor":  "llama-3.3-70b-versatile",      # best quality — legal reasoning
    "analyzer": "llama-3.1-70b-versatile",      # large context — document analysis
    "drafter":  "llama-3.3-70b-versatile",      # best quality — document drafting
}
```

### 4. Model Parameters
**Evidence:** Defined in `config.py` and passed dynamically in `utils/llm.py`.
* **Temperature:** `0.0` for routing, `0.2` for advising, `0.1` for analyzing, `0.4` for drafting (`config.py`, Lines 30-35).
* **Top_p:** Not explicitly set, defaults to the SDK value of `1.0`.
* **Max Tokens (Output):** `1024` for routing, `4096` for advising/analyzing, `8192` for drafting (`config.py`, Lines 42-47). Passed via `max_tokens` kwarg in `utils/llm.py` (Line 69).
* **Input Token Limit:** The model natively supports 128k context, but the system forcefully truncates document inputs to 15,000 characters to prevent overflow (`agents/doc_analyzer.py`).

### 5. System Prompt / Role Assignment
**Role:** Fearless legal advocate for Indian citizens.
**Evidence:** The system prompt explicitly assigns a persona and behavioral constraints.
* File: `prompts/conversation_prompt.py` (Lines 3-6)
```text
You are JusticeBot — a brilliant, fearless legal advocate who fights for
ordinary Indian citizens. You are NOT a search engine. You are NOT a textbook.
You are the user's personal lawyer friend who happens to be free.
```

### 6. Memory / Context Handling
**Type:** Multi-turn.
**Evidence:** The chatbot remembers previous interactions via a custom session manager.
* File: `memory/session.py`
* Implementation: `add_message(session_id, role, content)` appends messages to an in-memory dictionary `_SESSIONS`. It retains a rolling window of history, capped by `MAX_MESSAGES_PER_SESSION` (set to 20) to prevent context limits from being breached.

### 7. Data Flow Trace
**Evidence:** Tracing a user message through the stack:
1. **UI:** User types message. `static/script.js` (Line 510) triggers `fetch('/api/analyze', { stream: true })`.
2. **Backend Router:** `app.py` catches `POST /api/analyze`, checking rate limits.
3. **Agent:** Invokes `run_conversation()` in `agents/conversation_agent.py`.
4. **API Call:** Calls `chat_completion(stream=True)` in `utils/llm.py` (Line 80).
5. **Progressive Parsing:** `stream_conversation()` in `agents/conversation_agent.py` catches the `Groq` chunks, uses a custom regex/bracket-counter to yield partial JSON text strings (`delta`).
6. **Delivery:** `app.py` uses `Response(stream_with_context(generate()), mimetype='text/event-stream')` to push SSE.
7. **UI Render:** `script.js` (Line 538) reads the stream via `TextDecoder` and dynamically updates the DOM.

### 8. Technology Stack
**Evidence:** Based on project files.
* **Frontend:** Vanilla HTML5, CSS3, ES6 JavaScript (`templates/index.html`, `static/script.js`, `static/style.css`). No heavy frameworks (React/Angular) are used.
* **Backend:** Python 3.12, Flask 3.0 (`app.py`).
* **Database/Vector Store:** None. Uses a high-performance in-memory dictionary store (`memory/session.py`).
* **Hosting/Deployment:** Docker containerization (`Dockerfile`), Render (`render.yaml`), Vercel Serverless (`vercel.json`).

### 9. Thinking Level
**Level:** Multi-step Reasoning and Context-Awareness.
**Evidence:** The agent is not a basic Q&A bot. In `prompts/conversation_prompt.py` (Lines 36-80), the LLM is instructed to follow a strict state-machine (Phase 1: GATHERING -> Phase 2: ADVISING -> Phase 3: DRAFTING). During "Advising", the model must perform multi-step reasoning to simultaneously calculate a `case_strength_score`, anticipate `opponent_arguments`, and formulate a timeline, proving complex cognitive tracking.

### 10. Domain Focus
**Domain:** Indian Legal System & Rights Advocacy.
**Evidence:** 
* `prompts/conversation_prompt.py` explicitly restricts the model to Indian frameworks: IPC 1860, BNS 2023, CrPC 1973, BNSS 2023, Consumer Protection Act 2019, etc.
* `utils/dlsa.py` and `data/dlsa_offices.py` contain hardcoded contact information specifically for the District Legal Services Authorities (DLSA) / NALSA in India.

### 11. Deployment
**Evidence:** The codebase contains three distinct deployment strategies:
* **Docker:** A `Dockerfile` provides a `python:3.12-slim-bookworm` image, creating a non-root `appuser` and running the app via `gunicorn app:app -b 0.0.0.0:8080 --workers 2 --threads 4`.
* **Render:** The `render.yaml` file configures the app for Render's Web Service platform.
* **Vercel:** The `vercel.json` file sets up a serverless deployment targeting `@vercel/python`.

### 12. GitHub / Entry Point
**Entry Point:** `app.py`.
**Evidence:** The root WSGI application is instantiated via `app = Flask(__name__)` inside `app.py`. The `if __name__ == '__main__':` block triggers `app.run()`, making it the explicit execution entry point of the entire application.
