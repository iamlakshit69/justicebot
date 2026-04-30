# utils/pdf_export.py

import logging
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF

logger = logging.getLogger(__name__)

# ── Font Setup ────────────────────────────────────────────────────────────────
# fpdf2's built-in core fonts (Helvetica, Times, Courier) are latin-1 only.
# Any Hindi, Punjabi, Tamil or other Indic text is silently corrupted.
#
# Fix: register DejaVu Sans TTF which covers the full Unicode BMP including
# Devanagari, Gurmukhi, Tamil, Telugu, Bengali and most other Indic scripts.
#
# Fonts are looked up in this order:
#   1. <project_root>/static/fonts/   — bundled with the repo (preferred)
#   2. Common system font paths       — works on most Linux servers
#   3. Downloaded once to static/fonts/ from the official GitHub mirror
#
# The four variants (regular, bold, italic, bold-italic) are all registered
# so set_font() style flags keep working exactly as before.

_FONT_NAME = "DejaVu"

_DEJAVU_VARIANTS = {
    "":   "DejaVuSans.ttf",
    "B":  "DejaVuSans-Bold.ttf",
    "I":  "DejaVuSans-Oblique.ttf",
    "BI": "DejaVuSans-BoldOblique.ttf",
}

_DEJAVU_URLS = {
    "DejaVuSans.ttf":            "https://raw.githubusercontent.com/py-pdf/fpdf2/master/test/fonts/DejaVuSans.ttf",
    "DejaVuSans-Bold.ttf":       "https://raw.githubusercontent.com/py-pdf/fpdf2/master/test/fonts/DejaVuSans-Bold.ttf",
    "DejaVuSans-Oblique.ttf":    "https://raw.githubusercontent.com/py-pdf/fpdf2/master/test/fonts/DejaVuSans-Oblique.ttf",
    "DejaVuSans-BoldOblique.ttf":"https://raw.githubusercontent.com/py-pdf/fpdf2/master/test/fonts/DejaVuSans-BoldOblique.ttf",
}

# System font directories searched in order (Linux / macOS / Windows)
_SYSTEM_FONT_DIRS = [
    Path("/usr/share/fonts/truetype/dejavu"),
    Path("/usr/share/fonts/TTF"),
    Path("/usr/local/share/fonts"),
    Path("/Library/Fonts"),
    Path("C:/Windows/Fonts"),
]


def _project_font_dir() -> Path:
    """Return the bundled font directory relative to this file."""
    return Path(__file__).resolve().parent.parent / "static" / "fonts"


def _find_font(filename: str) -> Path | None:
    """
    Return an existing Path for *filename*, searching bundled dir then system
    dirs. Returns None if the font is not found anywhere on disk.
    """
    candidates = [_project_font_dir() / filename] + [d / filename for d in _SYSTEM_FONT_DIRS]
    for path in candidates:
        if path.exists():
            return path
    return None


def _download_font(filename: str) -> Path:
    """
    Download *filename* from the official DejaVu GitHub mirror into the
    bundled font directory. Creates the directory if it doesn't exist.
    Raises RuntimeError on failure.
    """
    dest_dir = _project_font_dir()
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    url  = _DEJAVU_URLS[filename]

    logger.info(f"Downloading font {filename} from {url} ...")
    try:
        urllib.request.urlretrieve(url, dest)
        logger.info(f"Font saved to {dest}")
        return dest
    except Exception as e:
        raise RuntimeError(f"Could not download font {filename}: {e}") from e


def _resolve_font(filename: str) -> Path:
    """
    Find or download *filename*. Guaranteed to return a valid Path or raise.
    """
    path = _find_font(filename)
    if path:
        return path
    logger.warning(f"Font {filename} not found locally — downloading.")
    return _download_font(filename)


def _register_fonts(pdf: FPDF) -> bool:
    """
    Register all four DejaVu variants on *pdf*.
    Returns True on success, False if any variant fails (caller falls back
    to Helvetica so the PDF still generates, just without Unicode support).
    """
    try:
        for style, filename in _DEJAVU_VARIANTS.items():
            font_path = _resolve_font(filename)
            pdf.add_font(_FONT_NAME, style=style, fname=str(font_path))
        return True
    except Exception as e:
        logger.error(f"Could not register DejaVu fonts — falling back to Helvetica: {e}")
        return False


# ── Text Helpers ──────────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """
    Strip invisible / zero-width Unicode control characters that can confuse
    the PDF renderer.  All printable Unicode — including Devanagari, Gurmukhi,
    Tamil etc. — is preserved as-is.  No more '????' corruption.
    """
    if not text:
        return ""
    # Only strip genuinely invisible/control characters; preserve all scripts
    invisible = {
        '\u200b',   # zero-width space
        '\u200c',   # zero-width non-joiner
        '\u200d',   # zero-width joiner
        '\ufeff',   # BOM
        '\u00ad',   # soft hyphen
    }
    for ch in invisible:
        text = text.replace(ch, '')
    return text


# ── PDF Class ─────────────────────────────────────────────────────────────────

class JusticeBotPDF(FPDF):
    """
    fpdf2 subclass with Unicode font support.
    Uses DejaVu Sans for all text so Indic scripts render correctly.
    Falls back to Helvetica transparently if DejaVu is unavailable.
    """

    def __init__(self):
        super().__init__()
        self._unicode = _register_fonts(self)

    # ── Internal font setter ──────────────────────────────────────────────────

    def _set(self, style: str = "", size: int = 10):
        """
        Wrapper around set_font that always uses the Unicode font if available.
        Accepts the same style flags ("", "B", "I", "BI") as set_font.
        """
        family = _FONT_NAME if self._unicode else "Helvetica"
        self.set_font(family, style=style, size=size)

    # ── Header / Footer ───────────────────────────────────────────────────────

    # ── Header / Footer ───────────────────────────────────────────────────────

    def header(self):
        # We don't want the default header on the very first "Cover" page.
        if self.page_no() == 1:
            return

        self._set("B", 14)
        self.set_text_color(40, 40, 40)
        self.cell(0, 10, "JusticeBot Legal Analysis", align="L", new_x="RIGHT", new_y="TOP")
        
        # Right aligned Domain
        self.set_x(10)
        self._set("I", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, "PRELIMINARY ASSESSMENT", align="R", new_x="LMARGIN", new_y="NEXT")
        
        self.set_draw_color(200, 200, 200)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-20)
        self.set_draw_color(200, 200, 200)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)
        
        self._set("I", 8)
        self.set_text_color(120, 120, 120)
        
        # Left side: Timestamp
        timestamp = f"Generated on {datetime.now(timezone.utc).strftime('%d %B %Y')} (UTC)"
        self.cell(100, 6, timestamp, align="L", new_x="RIGHT", new_y="TOP")
        
        # Right side: Page X of Y
        self.cell(0, 6, f"Page {self.page_no()} of {{nb}}", align="R", new_x="LMARGIN", new_y="NEXT")
        
        self.set_text_color(150, 150, 150)
        self.cell(
            0, 5,
            "Disclaimer: AI-generated guidance. This document does not constitute professional legal advice.",
            align="C",
        )

    # ── Layout Helpers ────────────────────────────────────────────────────────

    def cover_page(self, case_file: dict, analysis: dict):
        self.add_page()
        self.ln(30)
        
        # Title
        self._set("B", 24)
        self.set_text_color(30, 30, 30)
        self.cell(0, 14, "LEGAL CASE BRIEF", align="C", new_x="LMARGIN", new_y="NEXT")
        
        self.set_draw_color(0, 51, 102)  # Dark Blue
        self.set_line_width(1.5)
        self.line(40, self.get_y(), 170, self.get_y())
        
        self.ln(20)
        
        # Domain & Stats Box
        domain = str(analysis.get("domain") or case_file.get("domain") or "General").upper()
        strength = analysis.get("case_strength_score")
        strength_text = f"{strength}/10" if strength else "Pending Assessment"
        
        self.set_fill_color(245, 247, 250)
        self.rect(30, self.get_y(), 150, 40, style="F")
        self.ln(8)
        
        self._set("B", 12)
        self.set_text_color(50, 50, 50)
        self.set_x(40)
        self.cell(60, 10, "SUBJECT MATTER:")
        self._set("", 12)
        self.cell(0, 10, domain, new_x="LMARGIN", new_y="NEXT")
        
        self._set("B", 12)
        self.set_x(40)
        self.cell(60, 10, "EST. STRENGTH:")
        self._set("", 12)
        self.cell(0, 10, strength_text, new_x="LMARGIN", new_y="NEXT")
        
        self.ln(25)
        
        # "Prepared By" info
        self._set("I", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 6, "Prepared dynamically via JusticeBot AI", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 6, "CONFIDENTIAL & PRIVILEGED WORK PRODUCT", align="C", new_x="LMARGIN", new_y="NEXT")
        
        self.add_page()

    def section_title(self, title: str):
        self.ln(6)
        self._set("B", 14)
        self.set_text_color(0, 51, 102)  # Dark Blue
        self.cell(0, 10, _clean_text(title), new_x="LMARGIN", new_y="NEXT")
        
        # Thin underline
        self.set_draw_color(0, 51, 102)
        self.set_line_width(0.3)
        self.line(10, self.get_y() - 1, 100, self.get_y() - 1)
        self.ln(4)

    def subsection_title(self, title: str):
        self.ln(3)
        self._set("B", 11)
        self.set_text_color(60, 60, 60)
        self.cell(0, 8, _clean_text(title), new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body_text(self, text: str):
        self._set("", 10)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 6, _clean_text(text))
        self.ln(2)

    def bullet_item(self, text: str):
        self._set("", 10)
        self.set_text_color(20, 20, 20)
        self.set_x(15)
        self.multi_cell(0, 6, f"\u2022  {_clean_text(text)}")
        self.ln(1)
        
    def check_item(self, text: str, checked: bool):
        self._set(size=10)
        self.set_text_color(20, 20, 20)
        self.set_x(15)
        symbol = "[ X ]" if checked else "[   ]"
        self.multi_cell(0, 6, f"{symbol}  {_clean_text(text)}")
        self.ln(1)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_pdf(analysis: dict, case_file: dict, draft: str = None) -> bytes:
    """
    Generate a professional PDF report utilizing both the latest ADVISING analysis
    and the persisted case_file structures.
    """
    if not isinstance(analysis, dict):
        raise TypeError(f"generate_pdf() expected dict for analysis, got {type(analysis).__name__}")
    if not isinstance(case_file, dict):
        case_file = {}

    pdf = JusticeBotPDF()
    # alias nb gives total page count
    pdf.set_auto_page_break(auto=True, margin=20) 
    pdf.alias_nb_pages()
    
    # 1. Cover Page
    pdf.cover_page(case_file, analysis)
    
    # 2. Executive Summary / Current Status
    message = str(analysis.get("message") or "Consultation records attached.")
    pdf.section_title("Executive Summary")
    pdf.body_text(message)

    # 3. Case Facts & Parties (from case_file)
    facts_dict = case_file.get("facts", {})
    parties    = case_file.get("parties", {})
    
    if facts_dict or any(parties.values()):
        pdf.section_title("Case Particulars")
        
        if any(parties.values()):
            pdf.subsection_title("Parties")
            if parties.get("claimant"):
                pdf.bullet_item(f"Claimant: {parties['claimant']}")
            if parties.get("respondent"):
                pdf.bullet_item(f"Respondent: {parties['respondent']}")
            
        if facts_dict:
            pdf.subsection_title("Material Facts")
            for key, val in facts_dict.items():
                if val:
                    pdf.bullet_item(f"{key.replace('_', ' ').title()}: {val}")
    
    # 4. Legal Context
    sections = analysis.get("legal_sections", [])
    if sections:
        pdf.section_title("Applicable Legal Provisions")
        for section in sections:
            pdf.bullet_item(str(section))
            
    # 5. Evidentiary Requirements
    evidence = analysis.get("evidence_checklist", [])
    if evidence:
        pdf.section_title("Evidence & Documentation Checklist")
        for item in evidence:
            label = str(item.get("item", ""))
            status = str(item.get("status", "")).lower()
            pdf.check_item(label, status == "have")
            
    # 6. Strategic Analysis (Arguments & Strengths)
    factors = analysis.get("case_strength_factors", [])
    opponent_args = analysis.get("opponent_arguments", [])
    
    if factors or opponent_args:
        pdf.section_title("Strategic Assessment")
        if factors:
            pdf.subsection_title("Key Factors")
            for factor in factors:
                pdf.bullet_item(str(factor))
                
        if opponent_args:
            pdf.subsection_title("Anticipated Defences & Counter-Arguments")
            for arg_obj in opponent_args:
                arg_text = str(arg_obj.get("argument", ""))
                counter_text = str(arg_obj.get("counter", ""))
                pdf.bullet_item(f"They Will Argue: {arg_text}")
                pdf.bullet_item(f"Your Counter: {counter_text}\n")

    # 7. Action Plan / Timeline
    timeline = analysis.get("timeline", [])
    filing   = analysis.get("filing_info", {})
    
    if timeline or filing:
        pdf.section_title("Recommended Action Plan")
        
        if filing.get("forum"):
            pdf.subsection_title("Forum Selection")
            pdf.bullet_item(f"Where to File: {filing['forum']}")
            if filing.get("limitation_period"):
                pdf.bullet_item(f"Statute of Limitations: {filing['limitation_period']}")
                
        if timeline:
            pdf.subsection_title("Phased Sequence")
            for t_item in timeline:
                step = str(t_item.get("step", ""))
                when = str(t_item.get("when", ""))
                pdf.bullet_item(f"[{when}] {step}")

    # 8. Drafted Document Annexure
    if draft:
        pdf.add_page()
        pdf.section_title("ANNEXURE: Drafted Legal Instrument")
        
        # Format the draft with monospace-like simple formatting
        pdf._set("", 10)
        pdf.set_text_color(30, 30, 30)
        
        # Render line by line
        for line in str(draft).split('\n'):
            pdf.multi_cell(0, 5, _clean_text(line))
            
    return bytes(pdf.output())