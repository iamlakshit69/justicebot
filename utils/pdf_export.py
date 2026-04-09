# utils/pdf_export.py

import logging
import urllib.request
from datetime import datetime
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
    "DejaVuSans.ttf":            "https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans.ttf",
    "DejaVuSans-Bold.ttf":       "https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-Bold.ttf",
    "DejaVuSans-Oblique.ttf":    "https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-Oblique.ttf",
    "DejaVuSans-BoldOblique.ttf":"https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-BoldOblique.ttf",
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

    def header(self):
        self._set("B", 18)
        self.set_text_color(30, 30, 30)
        self.cell(0, 12, "JusticeBot", align="C", new_x="LMARGIN", new_y="NEXT")
        self._set("I", 10)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, "Free legal guidance for every citizen", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)
        self.set_draw_color(220, 220, 220)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        self.set_y(-20)
        self.set_draw_color(220, 220, 220)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)
        self._set("I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(
            0, 6,
            f"Generated on {datetime.now().strftime('%d %B %Y')}  |  Page {self.page_no()}",
            align="C", new_x="LMARGIN", new_y="NEXT",
        )
        self.cell(
            0, 5,
            "Disclaimer: AI-generated guidance only. Not a substitute for professional legal advice.",
            align="C",
        )

    # ── Layout Helpers ────────────────────────────────────────────────────────

    def section_title(self, title: str):
        self.ln(4)
        self._set("B", 12)
        self.set_text_color(74, 108, 247)
        self.cell(0, 8, _clean_text(title), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(74, 108, 247)
        self.line(10, self.get_y(), 80, self.get_y())
        self.ln(4)

    def body_text(self, text: str):
        self._set("", 10)
        self.set_text_color(60, 60, 60)
        self.multi_cell(0, 6, _clean_text(text))
        self.ln(2)

    def bullet_item(self, text: str):
        self._set("", 10)
        self.set_text_color(60, 60, 60)
        self.multi_cell(0, 6, f"  \u2022 {_clean_text(text)}")   # real bullet char

    def info_box(self, label: str, value: str, color: tuple):
        self.set_fill_color(*color)
        self._set("B", 9)
        self.set_text_color(60, 60, 60)
        self.cell(40, 8, _clean_text(label), fill=True)
        self._set("", 9)
        self.cell(0, 8, _clean_text(value), new_x="LMARGIN", new_y="NEXT")
        self.ln(1)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_pdf(analysis: dict, draft: str = None) -> bytes:
    """
    Generate a PDF report from the combined analysis dict and optional draft text.

    analysis keys expected:
        domain, confidence, key_facts,
        rights_summary, legal_sections, case_strength, next_steps

    Returns raw PDF bytes.
    Raises TypeError if analysis is not a dict (caller must validate before
    passing in — see the isinstance() guard added to app.py /api/pdf route).
    """
    if not isinstance(analysis, dict):
        raise TypeError(f"generate_pdf() expected dict, got {type(analysis).__name__}")

    pdf = JusticeBotPDF()
    pdf.add_page()

    domain     = str(analysis.get("domain", "N/A")).upper()
    confidence = analysis.get("confidence", 0)
    key_facts  = analysis.get("key_facts", [])

    try:
        pdf.section_title("Query Classification")
        pdf.info_box("Domain:", domain, (240, 244, 255))
        pdf.info_box("Confidence:", f"{confidence}%", (240, 244, 255))
        if key_facts:
            pdf.body_text("Key facts identified:")
            for fact in key_facts:
                pdf.bullet_item(str(fact))
    except Exception:
        logger.exception("PDF: failed to render Query Classification section")

    try:
        pdf.section_title("Your Legal Rights")
        pdf.body_text(str(analysis.get("rights_summary", "No analysis available.")))
    except Exception:
        logger.exception("PDF: failed to render Legal Rights section")

    try:
        sections = analysis.get("legal_sections", [])
        if sections:
            pdf.section_title("Relevant Laws & Sections")
            for section in sections:
                pdf.bullet_item(str(section))
    except Exception:
        logger.exception("PDF: failed to render Legal Sections section")

    try:
        strength = analysis.get("case_strength", 0)
        pdf.section_title("Case Strength")
        label = "Strong" if strength >= 70 else "Moderate" if strength >= 40 else "Weak"
        pdf.body_text(f"{strength}% \u2014 {label} case")
    except Exception:
        logger.exception("PDF: failed to render Case Strength section")

    try:
        steps = analysis.get("next_steps", [])
        if steps:
            pdf.section_title("Recommended Next Steps")
            for i, step in enumerate(steps, 1):
                pdf.bullet_item(f"{i}. {str(step)}")
    except Exception:
        logger.exception("PDF: failed to render Next Steps section")

    if draft:
        try:
            pdf.add_page()
            pdf.section_title("Drafted Legal Document")
            pdf.body_text(str(draft))
        except Exception:
            logger.exception("PDF: failed to render Draft section")

    return bytes(pdf.output())