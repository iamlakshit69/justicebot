# ⚖️ JusticeBot

**Free AI-powered legal guidance for every Indian citizen.**

JusticeBot helps ordinary people understand their legal rights, analyse documents for risky clauses, and draft essential legal letters — without needing a lawyer for every step.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Legal Chat** | Conversational AI that understands your situation and explains your rights under Indian law |
| 📄 **Document Analyser** | Upload a PDF or DOCX (rental agreement, loan, employment contract, etc.) and get a clause-by-clause risk report |
| 📝 **Document Drafter** | Generate ready-to-use FIRs, RTI applications, consumer complaints, and legal notices |
| 📥 **PDF Export** | Download your full legal report as a PDF |
| 🏛️ **DLSA Finder** | Look up the District Legal Services Authority office for any Indian state |
| 🔍 **Section Explainer** | Get a plain-language explanation of any Indian legal section (e.g. "Section 420 IPC") |

---

## 🛠️ Tech Stack

- **Backend:** Python 3 · Flask
- **AI Models:** [Groq](https://groq.com/) API · LLaMA 3.1 / 3.3 (via `groq` SDK)
- **Document Parsing:** PyMuPDF (PDF) · python-docx (DOCX)
- **PDF Generation:** fpdf2
- **Frontend:** Vanilla HTML/CSS/JS (served via Flask templates)

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- A [Groq API key](https://console.groq.com/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/iamlakshit69/justicebot.git
cd justicebot

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
FLASK_SECRET_KEY=your_secret_key_here   # generate with: python -c "import secrets; print(secrets.token_hex(32))"
DEBUG=false
HOST=0.0.0.0
PORT=8080
```

> **Note:** `FLASK_SECRET_KEY` is required in production. In `DEBUG=true` mode a temporary key is auto-generated.

### Run

```bash
python app.py
```

Open your browser at **http://localhost:8080**.

---

## 📁 Project Structure

```
justicebot/
├── app.py                  # Flask application & API routes
├── config.py               # Environment config, model names, temperatures
├── requirements.txt        # Python dependencies
│
├── agents/
│   ├── conversation_agent.py   # Multi-turn legal advice agent
│   ├── doc_analyzer.py         # Legal document clause risk analyser
│   └── drafter.py              # Legal document drafter (FIR, RTI, etc.)
│
├── prompts/
│   ├── conversation_prompt.py  # System prompt for the conversation agent
│   └── draft_prompts.py        # Prompt templates for each draft type
│
├── memory/
│   └── session.py              # In-memory session & conversation history
│
├── utils/
│   ├── doc_parser.py           # PDF/DOCX text extraction
│   ├── pdf_export.py           # PDF report generation
│   └── dlsa.py                 # DLSA office lookup helper
│
├── data/
│   └── dlsa_offices.py         # State-wise DLSA office data
│
├── static/
│   ├── script.js               # Frontend JavaScript
│   └── style.css               # Frontend styles
│
└── templates/
    └── index.html              # Single-page UI template
```

---

## 🔌 API Reference

All endpoints return JSON unless stated otherwise.

### `POST /api/analyze`
Run a conversation turn with the legal advice agent.

**Request body:**
```json
{
  "query": "My landlord is refusing to return my security deposit.",
  "session_id": "optional-uuid"
}
```

**Response:** JSON with `message`, `phase`, `domain`, `legal_sections`, `action_chips`, and more.

---

### `POST /api/document`
Upload a legal document for clause analysis.

**Form data:** `file` (PDF or DOCX, max 5 MB) · `session_id` (optional)

**Response:** JSON with `document_summary`, `total_clauses_reviewed`, and `clauses[]` (each with `risk_level`: `dangerous` / `questionable` / `safe`).

---

### `POST /api/draft`
Generate a legal document draft from the current session's case file.

**Request body:**
```json
{
  "draft_type": "fir",
  "session_id": "your-session-id"
}
```

`draft_type` must be one of: `fir` · `rti` · `consumer` · `notice`

---

### `POST /api/pdf`
Generate a downloadable PDF report.

**Request body:**
```json
{
  "analysis": { /* document analysis result */ },
  "draft": "Optional draft text to include"
}
```

**Response:** `application/pdf` file download.

---

### `GET /api/dlsa?state=<state>`
Get DLSA office details for a given Indian state.

**Example:** `GET /api/dlsa?state=maharashtra`

---

### `GET /api/dlsa/states`
List all states with DLSA data.

---

### `POST /api/explain-section`
Get a plain-language explanation of an Indian legal section.

**Request body:**
```json
{ "section": "Section 420 IPC" }
```

**Response:** JSON with `title`, `act`, `explanation`, `punishment`, and `example`.

---

### `POST /api/session/clear`
Clear the conversation history and case file for a session.

**Request body:**
```json
{ "session_id": "your-session-id" }
```

---

## ⚙️ Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | **Required.** Your Groq API key |
| `FLASK_SECRET_KEY` | — | **Required in production.** Flask session secret |
| `DEBUG` | `false` | Enable Flask debug mode (auto-generates secret key) |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8080` | Server port |

---

## 🔒 Security & Limits

- **Rate limiting:** 15 requests per IP per 60-second window (all endpoints)
- **File upload:** Max 5 MB per document
- **Query length:** Max 3 000 characters
- **Section input:** Alphanumeric and basic punctuation only (prompt injection guard)
- **Draft types:** Validated against a fixed whitelist
- **Risk levels:** Validated server-side before any DOM insertion

> **Production note:** The built-in rate limiter is in-process. For multi-worker deployments (e.g. gunicorn with multiple workers), replace it with a Redis-backed solution such as `flask-limiter` with `RedisStorage`.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## 📜 License

This project is open source. See [LICENSE](LICENSE) for details.

---

> **Disclaimer:** JusticeBot provides general legal information, not legal advice. For serious legal matters, always consult a qualified lawyer.
