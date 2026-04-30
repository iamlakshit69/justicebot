# app.py

import os
import uuid
import io
import json
import logging
import time
import re
from collections import defaultdict

from flask import Flask, request, jsonify, render_template, send_file, g, Response, stream_with_context
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

from config import GROQ_API_KEY, MODELS, HOST, PORT, DEBUG
from memory.session import (
    create_session, get_session, update_session, clear_session,
    add_message, get_messages, get_case_file, update_case_file
)
from agents.conversation_agent import run_conversation, stream_conversation
from agents.doc_analyzer import run_doc_analyzer
from agents.drafter import run_drafter
from agents.section_explainer import explain_section
from utils.doc_parser import parse_document
from utils.pdf_export import generate_pdf
from utils.dlsa import get_dlsa


# ── Logging ───────────────────────────────────────────────────────────────────
# Use a plain format for basicConfig so Werkzeug's startup messages
# (which never pass through Flask's request context) don't crash.
# We apply the request_id-enriched format only to our own handler.

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

class _RequestIdFilter(logging.Filter):
    """Inject g.request_id into every log record emitted by our app logger."""
    def filter(self, record):
        try:
            from flask import g as _g
            record.request_id = getattr(_g, 'request_id', '-')
        except RuntimeError:
            # Outside of a Flask request context (e.g. startup messages)
            record.request_id = '-'
        return True

_app_handler = logging.StreamHandler()
_app_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] [%(request_id)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))
_app_handler.addFilter(_RequestIdFilter())

logger = logging.getLogger(__name__)
logger.handlers = [_app_handler]
logger.propagate = False  # Don't also emit via the root (plain) handler


# ── App Setup ─────────────────────────────────────────────────────────────────

app = Flask(__name__)

# CORS — allows the API to be called from different origins
# (e.g. mobile apps, separate frontends, or during development).
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ProxyFix so request.remote_addr resolves to the real client IP
# behind NGINX, Render, AWS ALB, etc.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

_secret_key = os.environ.get('FLASK_SECRET_KEY')
if not _secret_key:
    if DEBUG:
        _secret_key = os.urandom(32).hex()
        logger.warning("⚠️  FLASK_SECRET_KEY not set — auto-generated for DEBUG mode.")
    else:
        raise RuntimeError(
            "FLASK_SECRET_KEY environment variable is not set. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
app.secret_key = _secret_key


# ── Request Lifecycle Middleware ──────────────────────────────────────────────

@app.before_request
def _before_request():
    """Assign a request ID and record the start time for duration logging."""
    g.request_id = str(uuid.uuid4())[:8]
    g.request_start = time.time()


@app.after_request
def _after_request(response):
    """Log how long each request took — critical for identifying slow LLM calls."""
    duration = time.time() - getattr(g, 'request_start', time.time())
    # Skip health checks and static files from timing logs
    if request.path not in ('/api/health', '/favicon.ico') and not request.path.startswith('/static'):
        logger.info(
            f"{request.method} {request.path} → {response.status_code} "
            f"({duration:.2f}s)"
        )
    return response


# ── Constants ─────────────────────────────────────────────────────────────────

MAX_QUERY_LENGTH    = 3000
MAX_SECTION_LENGTH  = 200
MAX_FILE_SIZE_MB    = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

VALID_DRAFT_TYPES = {'fir', 'rti', 'consumer', 'notice'}
VALID_RISK_LEVELS = {'dangerous', 'questionable', 'safe'}

# Legal section pattern — rejects HTML / script payloads / prompt injection
SECTION_PATTERN = re.compile(r'^[\w\s\.,\(\)\-/]+$')

# Prompt injection guard — lightweight pre-filter before the LLM call
_INJECTION_PATTERNS = [
    re.compile(r'ignore\s+(previous|all|above|prior)', re.I),
    re.compile(r'(system\s*prompt|jailbreak|act\s+as|you\s+are\s+now)', re.I),
    re.compile(r'<\s*(script|iframe|img)', re.I),
    re.compile(r'(disregard|forget|override)\s+(your|all|previous)', re.I),
]


def _is_prompt_injection(text: str) -> bool:
    return any(p.search(text) for p in _INJECTION_PATTERNS)


# ── Rate Limiter ──────────────────────────────────────────────────────────────
# NOTE: In-process. Works correctly for single-worker deployments only.
# For multi-worker gunicorn, switch to flask-limiter with RedisStorage.

rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX    = 15


def get_client_ip() -> str:
    return request.remote_addr or '0.0.0.0'


def is_rate_limited(client_ip: str) -> bool:
    now = time.time()
    # FIX: Filter expired timestamps and remove empty keys to prevent
    # unbounded memory growth from rotating IPs.
    timestamps = [t for t in rate_limit_store[client_ip] if now - t < RATE_LIMIT_WINDOW]
    if not timestamps:
        # No recent activity — remove the key entirely to free memory
        rate_limit_store.pop(client_ip, None)
        if len(rate_limit_store) == 0:
            return False
        timestamps = []
    if len(timestamps) >= RATE_LIMIT_MAX:
        rate_limit_store[client_ip] = timestamps
        return True
    timestamps.append(now)
    rate_limit_store[client_ip] = timestamps
    return False


# ── Startup Checks ────────────────────────────────────────────────────────────

if not GROQ_API_KEY:
    logger.warning("⚠️  GROQ_API_KEY is not set. All LLM API calls will fail.")
else:
    logger.info("✅ GROQ_API_KEY loaded.")

logger.info(f"🚀 Starting JusticeBot v2 — DEBUG={DEBUG}")


# ── GET / ─────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── GET /api/health ───────────────────────────────────────────────────────────

@app.route('/api/health')
def health():
    """Health check endpoint for deployment platforms, load balancers, uptime monitors."""
    return jsonify({'status': 'ok', 'version': '2.2', 'debug': DEBUG})


# ── POST /api/analyze — streaming SSE ────────────────────────────────────────
# Streams the bot response token-by-token using Server-Sent Events.
# The frontend reads the EventSource stream and appends tokens in real time.

@app.route('/api/analyze', methods=['POST'])
def analyze():
    client_ip = get_client_ip()
    if is_rate_limited(client_ip):
        logger.warning(f"Rate limited: {client_ip}")
        return jsonify({'error': 'Too many requests. Please wait a minute.'}), 429

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body.'}), 400

    query      = data.get('query', '').strip()
    session_id = data.get('session_id', '') or str(uuid.uuid4())

    if not query:
        return jsonify({'error': 'No query provided.'}), 400

    if len(query) > MAX_QUERY_LENGTH:
        return jsonify({'error': f'Query too long. Maximum {MAX_QUERY_LENGTH} characters.'}), 400

    # Prompt injection guard
    if _is_prompt_injection(query):
        logger.warning(f"Injection attempt blocked — session={session_id[:12]}")
        return jsonify({'error': 'Invalid query content.'}), 400

    logger.info(f"Analyze — session={session_id[:12]}  query_len={len(query)}")

    history   = get_messages(session_id)
    case_file = get_case_file(session_id)

    # Determine if client wants streaming (default: yes if Accept includes text/event-stream)
    wants_stream = data.get('stream', True)

    if wants_stream:
        def generate():
            full_message = ''
            final_result = None

            try:
                for event_type, payload in stream_conversation(query, history, case_file):
                    if event_type == 'delta':
                        full_message += payload
                        yield f"data: {json.dumps({'type': 'delta', 'text': payload})}\n\n"
                    elif event_type == 'done':
                        final_result = payload
                        # Patch the message with the streamed full text
                        final_result['message'] = full_message.strip() or final_result.get('message', '')
                        yield f"data: {json.dumps({'type': 'done', **final_result})}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'error': 'Something went wrong. Please try again.'})}\n\n"
                return

            if final_result:
                # Persist turn
                add_message(session_id, 'user', query)
                add_message(session_id, 'assistant', final_result['message'])
                if final_result.get('case_updates'):
                    update_case_file(session_id, final_result['case_updates'])
                for field in ('domain', 'phase', 'draft_type'):
                    if final_result.get(field):
                        update_case_file(session_id, {field: final_result[field]})

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',   # disable NGINX buffering
            }
        )
    else:
        # Non-streaming fallback
        result = run_conversation(query, history, case_file)
        add_message(session_id, 'user',      query)
        add_message(session_id, 'assistant', result['message'])
        if result.get('case_updates'):
            update_case_file(session_id, result['case_updates'])
        for field in ('domain', 'phase', 'draft_type'):
            if result.get(field):
                update_case_file(session_id, {field: result[field]})
        return jsonify(result)


# ── POST /api/document ────────────────────────────────────────────────────────

@app.route('/api/document', methods=['POST'])
def document():
    client_ip = get_client_ip()
    if is_rate_limited(client_ip):
        return jsonify({'error': 'Too many requests. Please wait a minute.'}), 429

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded.'}), 400

    file       = request.files['file']
    session_id = request.form.get('session_id', '') or str(uuid.uuid4())

    if not file.filename:
        return jsonify({'error': 'Empty filename.'}), 400

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > MAX_FILE_SIZE_BYTES:
        return jsonify({'error': f'File too large. Maximum {MAX_FILE_SIZE_MB} MB allowed.'}), 400

    logger.info(f"Document upload — session={session_id[:12]}  file={file.filename}  size={file_size}B")

    file_bytes = file.read()
    doc_text   = parse_document(file_bytes, file.filename)

    if not doc_text:
        return jsonify({'error': 'Could not extract text from document. Supported formats: PDF, DOCX.'}), 400

    try:
        result = run_doc_analyzer(doc_text)

        for clause in result.get('clauses', []):
            if clause.get('risk_level') not in VALID_RISK_LEVELS:
                clause['risk_level'] = 'safe'

        doc_summary = result.get('document_summary', '')
        if doc_summary:
            update_case_file(session_id, {'facts': {'document_summary': doc_summary}})

        return jsonify(result)

    except Exception as e:
        logger.error(f"Document analysis error: {e}", exc_info=True)
        return jsonify({'error': 'An error occurred while analysing the document. Please try again.'}), 500


# ── POST /api/draft ───────────────────────────────────────────────────────────

@app.route('/api/draft', methods=['POST'])
def draft():
    client_ip = get_client_ip()
    if is_rate_limited(client_ip):
        return jsonify({'error': 'Too many requests. Please wait a minute.'}), 429

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body.'}), 400

    draft_type = data.get('draft_type', 'notice')
    session_id = data.get('session_id', '')

    if draft_type not in VALID_DRAFT_TYPES:
        return jsonify({'error': f'Invalid draft type. Must be one of: {", ".join(sorted(VALID_DRAFT_TYPES))}.'}), 400

    case_file = get_case_file(session_id)
    logger.info(f"Draft — session={session_id[:12]}  type={draft_type}")

    try:
        draft_text = run_drafter(draft_type, case_file)
        return jsonify({'draft': draft_text})
    except Exception as e:
        logger.error(f"Draft error: {e}", exc_info=True)
        return jsonify({'error': 'An error occurred while generating the draft. Please try again.'}), 500


# ── POST /api/pdf ─────────────────────────────────────────────────────────────

@app.route('/api/pdf', methods=['POST'])
def pdf():
    client_ip = get_client_ip()
    if is_rate_limited(client_ip):
        return jsonify({'error': 'Too many requests. Please wait a minute.'}), 429

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body.'}), 400

    session_id = data.get('session_id', '')
    analysis   = data.get('analysis', {})
    draft_text = data.get('draft', '')

    if not isinstance(analysis, dict):
        return jsonify({'error': 'Invalid analysis payload. Expected an object.'}), 400

    if not isinstance(draft_text, str):
        draft_text = ''
        
    case_file = get_case_file(session_id) if session_id else {}

    try:
        pdf_bytes = generate_pdf(analysis, case_file, draft_text)
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='JusticeBot_Report.pdf'
        )
    except Exception as e:
        logger.error(f"PDF generation error: {e}", exc_info=True)
        return jsonify({'error': 'PDF generation failed. Please try again.'}), 500


# ── GET /api/dlsa ─────────────────────────────────────────────────────────────

@app.route('/api/dlsa', methods=['GET'])
def dlsa():
    state = request.args.get('state', '').strip().lower()
    if not state:
        return jsonify({'error': 'No state provided.'}), 400

    office = get_dlsa(state)
    if not office:
        return jsonify({'error': f'No DLSA office found for "{state}".'}), 404

    return jsonify(office)


@app.route('/api/dlsa/states', methods=['GET'])
def dlsa_states():
    from utils.dlsa import get_all_states
    return jsonify({'states': get_all_states()})


# ── POST /api/explain-section ─────────────────────────────────────────────────

@app.route('/api/explain-section', methods=['POST'])
def explain_section_route():
    client_ip = get_client_ip()
    if is_rate_limited(client_ip):
        return jsonify({'error': 'Too many requests. Please wait a minute.'}), 429

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body.'}), 400

    section = data.get('section', '').strip()

    if not section:
        return jsonify({'error': 'No section provided.'}), 400

    if len(section) > MAX_SECTION_LENGTH:
        return jsonify({'error': f'Section text too long. Maximum {MAX_SECTION_LENGTH} characters.'}), 400

    if not SECTION_PATTERN.match(section):
        return jsonify({'error': 'Invalid section format.'}), 400

    logger.info(f"Explain section — {section[:80]}")

    try:
        result = explain_section(section)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Explain section error: {e}", exc_info=True)
        return jsonify({'error': 'Could not explain this section. Please try again.'}), 500


# ── POST /api/session/clear ───────────────────────────────────────────────────

@app.route('/api/session/clear', methods=['POST'])
def clear_session_route():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid request body.'}), 400

    session_id = data.get('session_id', '').strip()
    if session_id:
        clear_session(session_id)
        logger.info(f"Session cleared: {session_id[:12]}...")

    return jsonify({'status': 'ok'})


# ── GET /api/case-file ────────────────────────────────────────────────────────

@app.route('/api/case-file', methods=['GET'])
def case_file_route():
    """Return the current case file for the session — used by the live sidebar."""
    session_id = request.args.get('session_id', '').strip()
    if not session_id:
        return jsonify({'error': 'No session_id provided.'}), 400

    case_file = get_case_file(session_id)
    return jsonify(case_file)


# ── RUN ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app.run(host=HOST, port=PORT, debug=DEBUG)
