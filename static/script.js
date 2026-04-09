// static/script.js
// JusticeBot — Premium UI Script (Enhanced with Section Popups + Legal Aid Finder)

let sessionId = generateSessionId();
let lastAnalysisResult = null;
let lastDraftText = null;
let isLoading = false;

// Legal Aid Finder state
let legalAidMap = null;
let legalAidMarkers = [];
let legalAidResults = [];
let currentLegalAidFilter = 'all';
let userLocationMarker = null;

function generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9);
}

// ── SECURITY: Risk-level whitelist ──
// clause.risk_level comes from LLM JSON and must never be injected into
// DOM attributes (class names) without validation — doing so is a stored
// XSS vector.  Only these three values are allowed through.

const VALID_RISK_LEVELS = new Set(['dangerous', 'questionable', 'safe']);

function sanitizeRiskLevel(level) {
    const normalized = String(level || '').toLowerCase().trim();
    return VALID_RISK_LEVELS.has(normalized) ? normalized : 'safe';
}

// ── INIT ──

document.addEventListener('DOMContentLoaded', () => {
    // Set keyboard hint based on OS
    const hintEl = document.getElementById('inputHint');
    if (hintEl) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
            navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? '⌘' : 'Ctrl';
        hintEl.innerHTML = `<kbd>${modKey}</kbd> + <kbd>Enter</kbd> to send · <kbd>Enter</kbd> for newline`;
    }

    // Scroll-to-bottom visibility
    const chatArea = document.getElementById('chatArea');
    if (chatArea) {
        chatArea.addEventListener('scroll', () => {
            const btn = document.getElementById('scrollBottomBtn');
            if (!btn) return;
            const distFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
            btn.style.display = distFromBottom > 150 ? 'flex' : 'none';
        });
    }
});


// ── AUTO-RESIZE TEXTAREA ──

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── SIDEBAR TOGGLE (MOBILE) ──

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
}

// ── DISCLAIMER ──

function dismissDisclaimer() {
    const banner = document.getElementById('disclaimerBanner');
    if (banner) {
        banner.style.animation = 'slideUp 0.3s var(--ease-out) forwards';
        setTimeout(() => banner.remove(), 300);
    }
}

// ── SCROLL TO BOTTOM ──

function scrollToBottom() {
    const chatArea = document.getElementById('chatArea');
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// ── HEADER COLLAPSE ──

function collapseHeader() {
    const header = document.getElementById('mainHeader');
    if (header && !header.classList.contains('collapsed')) {
        header.classList.add('collapsed');
    }
}

// ── LOADING STATE ──

function setLoading(loading) {
    isLoading = loading;
    const sendBtn = document.getElementById('sendBtn');
    const sendIcon = sendBtn.querySelector('.send-icon');
    const loadingIcon = sendBtn.querySelector('.loading-icon');
    const textarea = document.getElementById('userInput');

    if (loading) {
        sendBtn.disabled = true;
        sendBtn.classList.add('loading');
        sendIcon.style.display = 'none';
        loadingIcon.style.display = 'block';
        textarea.disabled = true;
    } else {
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
        sendIcon.style.display = 'block';
        loadingIcon.style.display = 'none';
        textarea.disabled = false;
        textarea.focus();
    }
}

// ── SEND QUERY ──

async function sendQuery() {
    if (isLoading) return;

    const input = document.getElementById('userInput');
    const query = input.value.trim();
    if (!query) return;

    // Input length validation
    if (query.length > 3000) {
        appendBotMessage('Your message is too long. Please keep it under 3000 characters.');
        return;
    }

    collapseHeader();
    appendUserMessage(query);
    input.value = '';
    input.style.height = 'auto';

    setLoading(true);
    const thinkingId = appendThinking('Analyzing your legal question...');

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, session_id: sessionId })
        });

        const data = await response.json();
        removeThinking(thinkingId);

        if (!response.ok || data.error) {
            appendBotMessage(escapeHTML(data.error || 'Something went wrong. Please try again.'));
            return;
        }

        lastAnalysisResult = data;
        renderAnalysisResult(data);

        // Highlight active domain in sidebar
        highlightDomain(data.domain);

    } catch (err) {
        removeThinking(thinkingId);
        appendBotMessage('Connection error. Please check that the server is running.');
    } finally {
        setLoading(false);
    }
}

function handleKeyDown(event) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? event.metaKey : event.ctrlKey;

    if (modKey && event.key === 'Enter') {
        event.preventDefault();
        sendQuery();
    }
    // Plain Enter inserts newline (default textarea behavior)
}

// ── NEW CHAT ──

async function startNewChat() {
    // Clear server session
    try {
        await fetch('/api/session/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (err) { /* ignore */ }

    // Reset client state
    sessionId = generateSessionId();
    lastAnalysisResult = null;
    lastDraftText = null;

    // Reset UI
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = '';

    // Re-add welcome message
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'bot-message welcome-message animate-in';
    welcomeDiv.innerHTML = `
        <div class="avatar bot-avatar">
            <i data-lucide="scale" style="width:18px;height:18px"></i>
        </div>
        <div class="message-content">
            <p><strong>Namaste!</strong> I am JusticeBot, your free legal aid assistant for Indian law.</p>
            <p>Tell me about your legal problem — whether it's a consumer dispute,
                tenant issue, workplace problem, RTI query, or criminal matter.
                I will explain your rights and guide you step by step.</p>
            <p class="upload-hint"><i data-lucide="paperclip" style="width:13px;height:13px"></i> You can also upload a contract or agreement for clause analysis.</p>
        </div>
    `;
    chatArea.appendChild(welcomeDiv);

    // Uncollapse header
    const header = document.getElementById('mainHeader');
    if (header) header.classList.remove('collapsed');

    // Reset upload status
    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) {
        uploadStatus.textContent = '';
        uploadStatus.style.color = '';
    }

    // Clear domain highlight
    document.querySelectorAll('.domain-list li').forEach(li => li.classList.remove('active'));

    // Close sidebar on mobile
    closeSidebar();

    if (window.lucide) lucide.createIcons();
}

// ── SELECT DOMAIN (clickable sidebar items) ──

function selectDomain(domain, placeholder) {
    const input = document.getElementById('userInput');
    input.value = placeholder;
    input.focus();
    autoResize(input);
    closeSidebar();
}

// ── HIGHLIGHT ACTIVE DOMAIN ──

function highlightDomain(domain) {
    const items = document.querySelectorAll('.domain-list li');
    items.forEach(li => {
        li.classList.remove('active');
        const liDomain = li.getAttribute('data-domain');
        if (liDomain && domain && domain.toLowerCase().includes(liDomain)) {
            li.classList.add('active');
        }
    });
}

// ── RENDER ANALYSIS RESULT ──

function renderAnalysisResult(data) {
    const chatArea = document.getElementById('chatArea');
    const delay = 120; // stagger delay in ms

    // Domain badge
    const domainDiv = createAnimatedMessage(`
        <div class="avatar bot-avatar">
            <i data-lucide="compass" style="width:18px;height:18px"></i>
        </div>
        <div class="result-card">
            <h3>Domain Classified</h3>
            <span class="domain-badge">${escapeHTML(data.domain)}</span>
            <p style="font-size:13px; color:var(--text-secondary)">
                Confidence: ${data.confidence}% &nbsp;·&nbsp; 
                Key facts extracted: ${data.key_facts.length}
            </p>
        </div>
    `, 0);
    chatArea.appendChild(domainDiv);

    // Rights summary
    const rightsDiv = createAnimatedMessage(`
        <div class="avatar bot-avatar">
            <i data-lucide="scroll-text" style="width:18px;height:18px"></i>
        </div>
        <div class="result-card">
            <h3>Your Legal Rights</h3>
            <p class="rights-text">${escapeHTML(data.rights_summary)}</p>
        </div>
    `, delay);
    chatArea.appendChild(rightsDiv);

    // Legal sections — NOW CLICKABLE
    const sectionsHTML = data.legal_sections.map(s =>
        `<li class="section-clickable" onclick="explainSection(this)" data-section="${escapeAttr(s)}">${escapeHTML(s)}<i data-lucide="info" style="width:14px;height:14px" class="section-info-icon"></i></li>`
    ).join('');

    const sectionsDiv = createAnimatedMessage(`
        <div class="avatar bot-avatar">
            <i data-lucide="book-open" style="width:18px;height:18px"></i>
        </div>
        <div class="result-card">
            <h3>Applicable Law Sections</h3>
            <p style="font-size:12px; color:var(--text-tertiary); margin-bottom:10px">Click any section to learn more</p>
            <ul class="sections-list">${sectionsHTML}</ul>
        </div>
    `, delay * 2);
    chatArea.appendChild(sectionsDiv);

    // Case strength meter
    const strength = data.case_strength;
    const strengthColor = strength >= 70 ? 'var(--success)' :
        strength >= 40 ? 'var(--warning)' : 'var(--danger)';
    const strengthLabel = strength >= 70 ? 'Strong Case' :
        strength >= 40 ? 'Moderate Case' : 'Weak Case';

    const strengthDiv = createAnimatedMessage(`
        <div class="avatar bot-avatar">
            <i data-lucide="bar-chart-3" style="width:18px;height:18px"></i>
        </div>
        <div class="result-card">
            <h3>Case Strength</h3>
            <div class="strength-bar-container">
                <div class="strength-bar-bg">
                    <div class="strength-bar-fill" 
                         style="width:0%; background:${strengthColor}"
                         data-target-width="${strength}%"></div>
                </div>
                <span class="strength-label" style="color:${strengthColor}">
                    ${strength}% — ${strengthLabel}
                </span>
            </div>
        </div>
    `, delay * 3);
    chatArea.appendChild(strengthDiv);

    // Animate the strength bar fill after it appears
    setTimeout(() => {
        const fill = strengthDiv.querySelector('.strength-bar-fill');
        if (fill) {
            fill.style.width = fill.getAttribute('data-target-width');
        }
    }, delay * 3 + 300);

    // Next steps
    const stepsHTML = data.next_steps.map(s => `<li>${escapeHTML(s)}</li>`).join('');

    const stepsDiv = createAnimatedMessage(`
        <div class="avatar bot-avatar">
            <i data-lucide="list-checks" style="width:18px;height:18px"></i>
        </div>
        <div class="result-card">
            <h3>Recommended Next Steps</h3>
            <ol class="steps-list">${stepsHTML}</ol>
        </div>
    `, delay * 4);
    chatArea.appendChild(stepsDiv);

    // Re-initialize Lucide icons for new elements
    if (window.lucide) lucide.createIcons();

    // Smooth scroll to bottom
    setTimeout(() => {
        chatArea.scrollTo({
            top: chatArea.scrollHeight,
            behavior: 'smooth'
        });
    }, delay * 5);
}

// ── DOCUMENT UPLOAD & ANALYSIS ──

async function analyzeDocument(input) {
    const file = input.files[0];
    if (!file) return;

    // File size check (5MB)
    if (file.size > 5 * 1024 * 1024) {
        const status = document.getElementById('uploadStatus');
        status.textContent = 'File too large (max 5MB)';
        status.style.color = 'var(--danger)';
        input.value = '';
        return;
    }

    collapseHeader();
    const status = document.getElementById('uploadStatus');
    status.textContent = `Analyzing ${file.name}...`;
    status.style.color = 'var(--text-secondary)';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    setLoading(true);
    const thinkingId = appendThinking(`Analyzing ${file.name}...`);

    try {
        const response = await fetch('/api/document', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        removeThinking(thinkingId);

        if (!response.ok || data.error) {
            status.textContent = 'Analysis failed';
            status.style.color = 'var(--danger)';
            appendBotMessage(escapeHTML(data.error || 'Document analysis failed.'));
            return;
        }

        status.textContent = `✓ ${file.name} analyzed`;
        status.style.color = 'var(--success)';
        renderDocumentResult(data);

        // Clear status after 5 seconds
        setTimeout(() => {
            status.textContent = '';
            status.style.color = '';
        }, 5000);

    } catch (err) {
        removeThinking(thinkingId);
        status.textContent = 'Upload failed';
        status.style.color = 'var(--danger)';
        appendBotMessage('Document upload failed. Please try again.');
    } finally {
        setLoading(false);
        input.value = ''; // Reset file input
    }
}

function renderDocumentResult(data) {
    const chatArea = document.getElementById('chatArea');
    const delay = 120;

    // Summary card
    const summaryDiv = createAnimatedMessage(`
        <div class="avatar bot-avatar">
            <i data-lucide="file-search" style="width:18px;height:18px"></i>
        </div>
        <div class="result-card">
            <h3>Document Summary</h3>
            <p class="rights-text">${escapeHTML(data.document_summary)}</p>
            <p style="font-size:12px; color:var(--text-tertiary); margin-top:10px">
                Total clauses reviewed: ${data.total_clauses_reviewed || data.clauses.length}
            </p>
        </div>
    `, 0);
    chatArea.appendChild(summaryDiv);

    // Clause cards
    const clausesDiv = document.createElement('div');
    clausesDiv.className = 'bot-message animate-in';
    clausesDiv.style.animationDelay = `${delay}ms`;

    let clausesHTML = '<div style="max-width:780px; width:100%">';
    clausesHTML += `<div class="result-card" style="margin-bottom:12px">
        <h3>Clause Analysis — Heatmap</h3>
    </div>`;

    data.clauses.forEach(clause => {
        // FIX: risk_level flows from LLM output → DOM class attribute.
        // Whitelisting here prevents stored XSS even if the backend
        // sanitisation step is ever bypassed or misconfigured.
        const safeRisk = sanitizeRiskLevel(clause.risk_level);
        clausesHTML += `
            <div class="clause-card ${safeRisk}">
                <span class="risk-badge ${safeRisk}">${escapeHTML(safeRisk)}</span>
                <div class="clause-title">${escapeHTML(clause.clause_title)}</div>
                <div class="clause-text">"${escapeHTML(clause.clause_text)}"</div>
                <div class="clause-explanation">${escapeHTML(clause.explanation)}</div>
                <div class="clause-recommendation">💡 ${escapeHTML(clause.recommendation)}</div>
            </div>
        `;
    });

    clausesHTML += '</div>';
    clausesDiv.innerHTML = `
        <div class="avatar bot-avatar">
            <i data-lucide="search" style="width:18px;height:18px"></i>
        </div>
        ${clausesHTML}
    `;
    chatArea.appendChild(clausesDiv);

    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
    }, delay * 2);
}

// ── DRAFT DOCUMENTS ──

async function requestDraft(draftType) {
    if (!lastAnalysisResult) {
        appendBotMessage('Please describe your legal problem first before requesting a draft document.');
        closeSidebar();
        return;
    }

    if (isLoading) return;

    closeSidebar();
    setLoading(true);
    const thinkingId = appendThinking(`Drafting ${draftType.toUpperCase()} document...`);

    try {
        const response = await fetch('/api/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                draft_type: draftType,
                session_id: sessionId
            })
        });

        const data = await response.json();
        removeThinking(thinkingId);

        if (!response.ok || data.error) {
            appendBotMessage(escapeHTML(data.error || 'Failed to generate draft.'));
            return;
        }

        lastDraftText = data.draft;
        showModal(`Draft ${draftType.toUpperCase()} Document`, data.draft);

    } catch (err) {
        removeThinking(thinkingId);
        appendBotMessage('Failed to generate draft. Please try again.');
    } finally {
        setLoading(false);
    }
}

// ── SECTION EXPLANATION (NEW) ──

async function explainSection(el) {
    const sectionText = el.getAttribute('data-section');
    if (!sectionText) return;

    // Open the section modal
    const overlay = document.getElementById('sectionModalOverlay');
    const modal = document.getElementById('sectionModal');
    const title = document.getElementById('sectionModalTitle');
    const loading = document.getElementById('sectionLoading');
    const content = document.getElementById('sectionContent');

    title.textContent = sectionText;
    loading.style.display = 'flex';
    content.style.display = 'none';

    overlay.style.display = 'block';
    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();

    // Close on Escape
    document.addEventListener('keydown', handleSectionModalKeyDown);

    try {
        const response = await fetch('/api/explain-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: sectionText })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            loading.innerHTML = `<p style="color:var(--danger)">Could not explain this section. Please try again.</p>`;
            return;
        }

        // Populate fields
        document.getElementById('sectionAct').textContent = data.act || 'N/A';
        document.getElementById('sectionExplanation').textContent = data.explanation || 'No explanation available.';
        document.getElementById('sectionPunishment').textContent = data.punishment || 'Not specified.';
        document.getElementById('sectionExample').textContent = data.example || 'No example available.';

        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (err) {
        loading.innerHTML = `<p style="color:var(--danger)">Connection error. Please try again.</p>`;
    }
}

function closeSectionModal() {
    const overlay = document.getElementById('sectionModalOverlay');
    const modal = document.getElementById('sectionModal');

    modal.style.animation = 'modalOut 0.25s var(--ease-out) forwards';
    overlay.style.animation = 'fadeOutAnim 0.25s var(--ease-out) forwards';

    setTimeout(() => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
        modal.style.animation = '';
        overlay.style.animation = '';
    }, 250);

    document.removeEventListener('keydown', handleSectionModalKeyDown);
}

function handleSectionModalKeyDown(e) {
    if (e.key === 'Escape') closeSectionModal();
}

// ── PDF DOWNLOAD ──

async function downloadPDF() {
    // Guard: ensure we have data to generate PDF from
    if (!lastAnalysisResult && !lastDraftText) {
        appendBotMessage('No analysis data available. Please analyze a legal query first.');
        closeModal();
        return;
    }

    const btn = document.getElementById('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:16px;height:16px" class="spin"></i> Generating...';
    btn.disabled = true;
    if (window.lucide) lucide.createIcons();

    try {
        const response = await fetch('/api/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                analysis: lastAnalysisResult || {},
                draft: lastDraftText || '',
                session_id: sessionId
            })
        });

        // BUG fix: check response.ok before treating as PDF
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'PDF generation failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'JusticeBot_Report.pdf';
        a.click();
        window.URL.revokeObjectURL(url);

        btn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px"></i> Downloaded!';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }, 2000);

    } catch (err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
        appendBotMessage('PDF generation failed. Please try again.');
    }
}

// ── COPY TO CLIPBOARD ──

async function copyDraftToClipboard() {
    const btn = document.getElementById('copyDraftBtn');
    const text = lastDraftText || document.getElementById('modalBody').textContent;

    try {
        await navigator.clipboard.writeText(text);
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px"></i> Copied!';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = originalText;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px"></i> Copied!';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = originalText;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    }
}

// ── MODAL (for drafts) ──

function showModal(title, content) {
    document.getElementById('modalTitle').innerHTML = `
        <i data-lucide="file-text" style="width:18px;height:18px"></i>
        <span>${escapeHTML(title)}</span>
    `;

    // Render draft text with basic formatting (preserve paragraphs & line breaks)
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = formatDraftText(content);

    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('resultModal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();

    // Trap focus & close on Escape
    document.addEventListener('keydown', handleModalKeyDown);
}

function formatDraftText(text) {
    if (!text) return '';
    // Escape HTML first, then add line break formatting
    let formatted = escapeHTML(text);
    // Convert double newlines to paragraph breaks
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    // Convert single newlines to line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    // Wrap in paragraph
    return `<p>${formatted}</p>`;
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('resultModal');

    // Animate out
    modal.style.animation = 'modalOut 0.25s var(--ease-out) forwards';
    overlay.style.animation = 'fadeOutAnim 0.25s var(--ease-out) forwards';

    setTimeout(() => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
        modal.style.animation = '';
        overlay.style.animation = '';
    }, 250);

    document.removeEventListener('keydown', handleModalKeyDown);
}

function handleModalKeyDown(e) {
    if (e.key === 'Escape') closeModal();
}

// ══════════════════════════════════════════════════
// ── LEGAL AID FINDER ──
// ══════════════════════════════════════════════════

function openLegalAidFinder() {
    closeSidebar();

    const overlay = document.getElementById('legalAidOverlay');
    const modal = document.getElementById('legalAidModal');

    overlay.style.display = 'block';
    modal.style.display = 'flex';

    if (window.lucide) lucide.createIcons();

    // Close on Escape
    document.addEventListener('keydown', handleLegalAidKeyDown);

    // Initialize map if not already
    setTimeout(() => {
        if (!legalAidMap) {
            initLegalAidMap();
        } else {
            legalAidMap.invalidateSize();
        }
    }, 300);
}

function closeLegalAidFinder() {
    const overlay = document.getElementById('legalAidOverlay');
    const modal = document.getElementById('legalAidModal');

    modal.style.animation = 'legalAidModalOut 0.3s var(--ease-out) forwards';
    overlay.style.animation = 'fadeOutAnim 0.3s var(--ease-out) forwards';

    setTimeout(() => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
        modal.style.animation = '';
        overlay.style.animation = '';
    }, 300);

    document.removeEventListener('keydown', handleLegalAidKeyDown);
}

function handleLegalAidKeyDown(e) {
    if (e.key === 'Escape') closeLegalAidFinder();
}

function initLegalAidMap() {
    const mapEl = document.getElementById('legalAidMap');
    if (!mapEl) return;

    // Default to center of India
    legalAidMap = L.map('legalAidMap', {
        zoomControl: true,
        attributionControl: true
    }).setView([20.5937, 78.9629], 5);

    // Use dark Carto tiles to match the app theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(legalAidMap);
}

function setLegalAidStatus(text, type = 'info') {
    const statusDiv = document.getElementById('legalAidStatus');
    const statusText = document.getElementById('legalAidStatusText');
    statusDiv.style.display = 'flex';
    statusText.textContent = text;

    statusDiv.className = 'legal-aid-status';
    if (type === 'success') statusDiv.classList.add('status-success');
    else if (type === 'error') statusDiv.classList.add('status-error');
    else if (type === 'loading') statusDiv.classList.add('status-loading');

    if (window.lucide) lucide.createIcons();
}

function hideLegalAidStatus() {
    document.getElementById('legalAidStatus').style.display = 'none';
}

// ── AUTO-DETECT LOCATION ──

function autoDetectLocation() {
    const btn = document.getElementById('locationDetectBtn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:16px;height:16px" class="spin"></i><span>Detecting...</span>';
    if (window.lucide) lucide.createIcons();

    setLegalAidStatus('Detecting your location...', 'loading');

    if (!navigator.geolocation) {
        setLegalAidStatus('Geolocation is not supported by your browser.', 'error');
        resetDetectBtn(btn);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            setLegalAidStatus(`Location detected! Searching nearby legal resources...`, 'loading');

            // Reverse geocode to get address + state
            let detectedState = '';
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
                    headers: { 'Accept-Language': 'en' }
                });
                const geoData = await geoRes.json();
                const addr = geoData.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                document.getElementById('locationInput').value = addr;
                detectedState = (geoData.address && geoData.address.state) || '';
            } catch (e) {
                document.getElementById('locationInput').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }

            // Center map and place user marker
            centerMapOnLocation(lat, lng);

            // Search nearby courts & police
            await searchNearbyLegalAid(lat, lng);

            // Fetch DLSA legal aid for detected state
            if (detectedState) fetchDLSAForState(detectedState);

            resetDetectBtn(btn);
        },
        (error) => {
            let msg = 'Location access denied. Please enable location permission or enter an address manually.';
            if (error.code === error.TIMEOUT) msg = 'Location request timed out. Please try again.';
            if (error.code === error.POSITION_UNAVAILABLE) msg = 'Position unavailable. Please enter your address.';
            setLegalAidStatus(msg, 'error');
            resetDetectBtn(btn);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

function resetDetectBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="crosshair" style="width:16px;height:16px"></i><span>Auto-detect Location</span>';
    if (window.lucide) lucide.createIcons();
}

// ── SEARCH BY ADDRESS ──

async function searchByAddress() {
    const input = document.getElementById('locationInput');
    const address = input.value.trim();
    if (!address) {
        input.classList.add('flash-error');
        setTimeout(() => input.classList.remove('flash-error'), 600);
        return;
    }

    setLegalAidStatus('Geocoding your address...', 'loading');

    try {
        // Add "India" to the query for better results
        const query = address.toLowerCase().includes('india') ? address : `${address}, India`;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const data = await response.json();

        if (!data || data.length === 0) {
            setLegalAidStatus('Could not find that location. Try a different address or pincode.', 'error');
            return;
        }

        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        // Update input with the found address
        input.value = data[0].display_name;

        // Extract state from address details
        const addrDetails = data[0].address || {};
        const detectedState = addrDetails.state || '';

        centerMapOnLocation(lat, lng);
        setLegalAidStatus('Searching nearby courts & police stations...', 'loading');
        await searchNearbyLegalAid(lat, lng);

        // Fetch DLSA legal aid for detected state
        if (detectedState) fetchDLSAForState(detectedState);

    } catch (err) {
        setLegalAidStatus('Geocoding failed. Please try again.', 'error');
    }
}

// ── CENTER MAP ──

function centerMapOnLocation(lat, lng) {
    if (!legalAidMap) return;

    // Hide placeholder
    const placeholder = document.getElementById('mapPlaceholder');
    if (placeholder) placeholder.style.display = 'none';

    legalAidMap.setView([lat, lng], 14);

    // Remove old user marker
    if (userLocationMarker) {
        legalAidMap.removeLayer(userLocationMarker);
    }

    // Add user location marker with custom icon
    const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div class="user-marker-pulse"></div><div class="user-marker-dot"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    userLocationMarker = L.marker([lat, lng], { icon: userIcon })
        .addTo(legalAidMap)
        .bindPopup('<strong>Your Location</strong>')
        .openPopup();

    legalAidMap.invalidateSize();
}

// ── SEARCH NEARBY LEGAL AID ──
// FIX: overpass-api.de frequently rate-limits, rejects browser CORS pre-flights,
// and stalls the tab indefinitely (no timeout in the original code).
//
// Replacement strategy:
//   1. Try each Overpass mirror in sequence, with a 12 s AbortController timeout.
//   2. If all mirrors fail, fall back to Nominatim place-search which has no
//      CORS restrictions and is already used for reverse-geocoding elsewhere.
//
// No new API keys required — both services are public OSM infrastructure.

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function _fetchOverpass(query, timeoutMs = 12000) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
                signal: controller.signal,
            });
            clearTimeout(tid);
            if (!res.ok) continue;
            return await res.json();
        } catch (_) {
            clearTimeout(tid);
            // Endpoint timed out or rejected — try the next one
        }
    }
    return null; // all endpoints failed → caller uses Nominatim fallback
}

async function _searchViaNominatim(lat, lng) {
    // Nominatim text-based search for each category within the bounding box.
    // Using q= parameter instead of amenity= because:
    //   - "office=lawyer" is not a Nominatim amenity
    //   - "legal_aid" amenity tags are extremely rare in India's OSM data
    //   - Text search finds actual business names like "Advocate Sharma" or "District Court"
    // Only search for courts and police — lawyers/legal aid are handled
    // separately via the DLSA backend data
    const queries = [
        { q: 'court',          category: 'court' },
        { q: 'district court', category: 'court' },
        { q: 'police station', category: 'police' },
        { q: 'police',         category: 'police' },
    ];

    const results = [];
    const seenIds = new Set();

    // Wider bounding box (~20 km) for better coverage
    const boxSize = 0.2;

    for (const { q, category } of queries) {
        try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}` +
                `&viewbox=${lng - boxSize},${lat + boxSize},${lng + boxSize},${lat - boxSize}` +
                `&bounded=1&limit=8&addressdetails=1`,
                { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
            );
            clearTimeout(tid);
            const data = await res.json();
            data.forEach(item => {
                if (seenIds.has(item.place_id)) return;
                seenIds.add(item.place_id);
                const iLat = parseFloat(item.lat);
                const iLng = parseFloat(item.lon);
                results.push({
                    id: item.place_id,
                    name: item.display_name.split(',')[0].trim(),
                    category,
                    lat: iLat,
                    lng: iLng,
                    distance: getDistanceKm(lat, lng, iLat, iLng),
                    address: item.display_name,
                    phone: '',
                    website: '',
                });
            });
            // Small delay between requests to respect Nominatim's rate limit (1 req/sec)
            await new Promise(r => setTimeout(r, 300));
        } catch (_) { /* skip this query */ }
    }
    return results;
}

async function searchNearbyLegalAid(lat, lng) {
    // Clear old markers
    legalAidMarkers.forEach(m => legalAidMap.removeLayer(m));
    legalAidMarkers = [];
    legalAidResults = [];

    const radius = 10000; // 10 km

    // Only search courts & police — legal aid is handled via DLSA backend data
    const overpassQuery = `
[out:json][timeout:20];
(
  node["amenity"="courthouse"](around:${radius},${lat},${lng});
  way["amenity"="courthouse"](around:${radius},${lat},${lng});
  node["amenity"="police"](around:${radius},${lat},${lng});
  way["amenity"="police"](around:${radius},${lat},${lng});
  node["building"="government"]["name"~"court|judicial",i](around:${radius},${lat},${lng});
);
out center body;
>;
out skel qt;`.trim();

    let usedFallback = false;

    try {
        // ── Try Overpass (multiple mirrors, with timeout) ──────────────────
        const overpassData = await _fetchOverpass(overpassQuery);

        if (overpassData) {
            const elements = overpassData.elements || [];
            elements.forEach(el => {
                const elLat = el.lat || (el.center && el.center.lat);
                const elLng = el.lon || (el.center && el.center.lon);
                if (!elLat || !elLng) return;

                const tags = el.tags || {};
                const name = tags.name || tags['name:en'] || categorizePlace(tags);
                const category = getCategory(tags);

                if (!name || name === 'Unknown') return;

                legalAidResults.push({
                    id: el.id,
                    name,
                    category,
                    lat: elLat,
                    lng: elLng,
                    distance: getDistanceKm(lat, lng, elLat, elLng),
                    address: buildAddress(tags),
                    phone: tags.phone || tags['contact:phone'] || '',
                    website: tags.website || tags['contact:website'] || '',
                });
            });
        } else {
            // ── Nominatim fallback ─────────────────────────────────────────
            usedFallback = true;
            const fallbackResults = await _searchViaNominatim(lat, lng);
            legalAidResults.push(...fallbackResults);
        }

        // Sort by distance
        legalAidResults.sort((a, b) => a.distance - b.distance);

        // Add markers
        legalAidResults.forEach(result => {
            legalAidMarkers.push(createMapMarker(result));
        });

        // Reset tab state
        currentLegalAidFilter = 'all';
        renderLegalAidResults();
        document.querySelectorAll('.lai-tab').forEach(t => t.classList.remove('active'));
        const allTab = document.querySelector('.lai-tab[data-category="all"]');
        if (allTab) allTab.classList.add('active');

        if (legalAidResults.length > 0) {
            const note = usedFallback ? ' (via Nominatim)' : '';
            setLegalAidStatus(`Found ${legalAidResults.length} legal resources within 10 km${note}`, 'success');
            if (legalAidMarkers.length > 0) {
                const group = L.featureGroup([userLocationMarker, ...legalAidMarkers]);
                legalAidMap.fitBounds(group.getBounds().pad(0.1));
            }
        } else {
            setLegalAidStatus('No legal resources found nearby. Try a wider search or enter a city centre.', 'info');
        }

    } catch (err) {
        console.error('Legal aid search error:', err);
        setLegalAidStatus('Search failed. Please try again or enter a different location.', 'error');
    }
}

// ── FETCH DLSA LEGAL AID FOR STATE ──

async function fetchDLSAForState(state) {
    const container = document.getElementById('dlsaCardContainer');
    const card = document.getElementById('dlsaCard');

    if (!container || !card) return;

    // Normalize state name for the API
    const stateName = state.trim();
    if (!stateName) {
        container.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`/api/dlsa?state=${encodeURIComponent(stateName)}`);
        const data = await res.json();

        if (!res.ok || data.error) {
            // Try without spaces/diacritics — e.g. "National Capital Territory of Delhi" → "Delhi"
            const shortState = stateName.replace(/^.*of\s+/i, '').trim();
            if (shortState !== stateName) {
                return fetchDLSAForState(shortState);
            }
            container.style.display = 'none';
            return;
        }

        // Render the DLSA card
        card.innerHTML = `
            <div class="dlsa-authority">${escapeHTML(data.authority || 'Legal Services Authority')}</div>
            <div class="dlsa-state-label">${escapeHTML(stateName)}</div>
            ${data.address ? `
                <div class="dlsa-info-row">
                    <i data-lucide="map-pin" style="width:14px;height:14px;flex-shrink:0"></i>
                    <span>${escapeHTML(data.address)}</span>
                </div>` : ''}
            ${data.phone ? `
                <div class="dlsa-info-row">
                    <i data-lucide="phone" style="width:14px;height:14px;flex-shrink:0"></i>
                    <a href="tel:${data.phone}" class="dlsa-link">${escapeHTML(data.phone)}</a>
                </div>` : ''}
            ${data.email ? `
                <div class="dlsa-info-row">
                    <i data-lucide="mail" style="width:14px;height:14px;flex-shrink:0"></i>
                    <a href="mailto:${data.email}" class="dlsa-link">${escapeHTML(data.email)}</a>
                </div>` : ''}
            <div class="dlsa-helpline">
                <i data-lucide="phone-call" style="width:14px;height:14px"></i>
                <span>NALSA Helpline: <strong>15100</strong> (toll-free)</span>
            </div>
        `;

        container.style.display = 'block';
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('DLSA fetch error:', err);
        container.style.display = 'none';
    }
}

// ── HELPER FUNCTIONS ──

function getCategory(tags) {
    if (tags.amenity === 'courthouse' || (tags.building === 'government' && /court|judicial/i.test(tags.name || '')))
        return 'court';
    if (tags.amenity === 'police') return 'police';
    return 'court'; // default
}

function categorizePlace(tags) {
    if (tags.amenity === 'courthouse') return 'Court';
    if (tags.amenity === 'police') return 'Police Station';
    return 'Unknown';
}

function buildAddress(tags) {
    const parts = [
        tags['addr:housenumber'],
        tags['addr:street'],
        tags['addr:city'],
        tags['addr:district'],
        tags['addr:state'],
        tags['addr:postcode']
    ].filter(Boolean);
    return parts.join(', ') || '';
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const categoryConfig = {
    court: { color: '#818cf8', icon: 'landmark', label: 'Court' },
    police: { color: '#f87171', icon: 'badge', label: 'Police Station' },
};

function createMapMarker(result) {
    const config = categoryConfig[result.category] || categoryConfig.court;

    const icon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="map-marker-pin" style="background:${config.color}">
                   <i data-lucide="${config.icon}" style="width:14px;height:14px;color:white"></i>
               </div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -42]
    });

    const marker = L.marker([result.lat, result.lng], { icon: icon }).addTo(legalAidMap);

    const popupContent = `
        <div class="map-popup">
            <strong>${escapeHTML(result.name)}</strong>
            <span class="popup-category" style="color:${config.color}">${config.label}</span>
            ${result.address ? `<span class="popup-address">${escapeHTML(result.address)}</span>` : ''}
            <span class="popup-distance">${result.distance.toFixed(1)} km away</span>
            ${result.phone ? `<a href="tel:${result.phone}" class="popup-phone">📞 ${escapeHTML(result.phone)}</a>` : ''}
        </div>
    `;

    marker.bindPopup(popupContent);

    // Re-init lucide icons after marker is added
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);

    return marker;
}

// ── RENDER RESULTS LIST ──

function renderLegalAidResults() {
    const listEl = document.getElementById('legalAidList');
    const emptyEl = document.getElementById('legalAidEmpty');

    const filtered = currentLegalAidFilter === 'all'
        ? legalAidResults
        : legalAidResults.filter(r => r.category === currentLegalAidFilter);

    if (filtered.length === 0) {
        emptyEl.style.display = 'flex';
        emptyEl.innerHTML = `
            <i data-lucide="search-x" style="width:36px;height:36px"></i>
            <p>${legalAidResults.length === 0 ? 'Search for a location to find<br>legal resources near you' : 'No results in this category'}</p>
        `;
        if (window.lucide) lucide.createIcons();
        // Remove old cards
        listEl.querySelectorAll('.lai-card').forEach(c => c.remove());
        return;
    }

    emptyEl.style.display = 'none';
    // Remove old cards
    listEl.querySelectorAll('.lai-card').forEach(c => c.remove());

    filtered.forEach((result, idx) => {
        const config = categoryConfig[result.category] || categoryConfig.court;
        const card = document.createElement('div');
        card.className = 'lai-card';
        card.style.animationDelay = `${idx * 50}ms`;
        card.innerHTML = `
            <div class="lai-card-icon" style="background:${config.color}20; color:${config.color}">
                <i data-lucide="${config.icon}" style="width:18px;height:18px"></i>
            </div>
            <div class="lai-card-body">
                <div class="lai-card-name">${escapeHTML(result.name)}</div>
                <span class="lai-card-cat" style="color:${config.color}">${config.label}</span>
                ${result.address ? `<span class="lai-card-addr">${escapeHTML(result.address)}</span>` : ''}
                <div class="lai-card-meta">
                    <span class="lai-card-dist">${result.distance.toFixed(1)} km</span>
                    ${result.phone ? `<a href="tel:${result.phone}" class="lai-card-phone">📞 ${escapeHTML(result.phone)}</a>` : ''}
                </div>
            </div>
            <button class="lai-card-locate" onclick="focusOnMarker(${result.lat}, ${result.lng})" title="Show on map">
                <i data-lucide="map-pin" style="width:16px;height:16px"></i>
            </button>
        `;
        listEl.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

function filterLegalAidResults(category) {
    currentLegalAidFilter = category;

    // Update tab state
    document.querySelectorAll('.lai-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-category') === category);
    });

    renderLegalAidResults();
}

function focusOnMarker(lat, lng) {
    if (!legalAidMap) return;
    legalAidMap.setView([lat, lng], 17);

    // Find and open the marker's popup
    legalAidMarkers.forEach(m => {
        const pos = m.getLatLng();
        if (Math.abs(pos.lat - lat) < 0.0001 && Math.abs(pos.lng - lng) < 0.0001) {
            m.openPopup();
        }
    });
}

// ── CHAT HELPERS ──

function appendUserMessage(text) {
    const chatArea = document.getElementById('chatArea');
    const div = document.createElement('div');
    div.className = 'user-message animate-in';
    div.innerHTML = `<div class="user-bubble">${escapeHTML(text)}</div>`;
    chatArea.appendChild(div);
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

function appendBotMessage(text) {
    const chatArea = document.getElementById('chatArea');
    const div = document.createElement('div');
    div.className = 'bot-message animate-in';
    // text is already escaped by callers, but use escapeHTML for safety on any remaining raw calls
    div.innerHTML = `
        <div class="avatar bot-avatar">
            <i data-lucide="scale" style="width:18px;height:18px"></i>
        </div>
        <div class="message-content"><p>${text}</p></div>
    `;
    chatArea.appendChild(div);
    if (window.lucide) lucide.createIcons();
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

function appendThinking(label) {
    const chatArea = document.getElementById('chatArea');
    const id = 'thinking_' + Date.now();
    const div = document.createElement('div');
    div.className = 'thinking-message';
    div.id = id;
    div.innerHTML = `
        <div class="avatar bot-avatar">
            <i data-lucide="scale" style="width:18px;height:18px"></i>
        </div>
        <div class="thinking-content">
            <div class="thinking-dots">
                <span></span><span></span><span></span>
            </div>
            <span class="thinking-label">${escapeHTML(label || 'Thinking...')}</span>
        </div>
    `;
    chatArea.appendChild(div);
    if (window.lucide) lucide.createIcons();
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
    return id;
}

function removeThinking(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.animation = 'fadeOutAnim 0.2s var(--ease-out) forwards';
        setTimeout(() => el.remove(), 200);
    }
}

// ── UTILITY ──

function createAnimatedMessage(innerHTML, delayMs) {
    const div = document.createElement('div');
    div.className = 'bot-message animate-in';
    div.style.animationDelay = `${delayMs}ms`;
    div.innerHTML = innerHTML;
    return div;
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── CSS ANIMATION FOR MODAL EXIT ──
// Inject keyframes for modal exit animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes modalOut {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
    }
    @keyframes fadeOutAnim {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    @keyframes legalAidModalOut {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
    }
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(styleSheet);