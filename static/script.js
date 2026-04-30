// static/script.js
// JusticeBot v3.0 — Premium Legal AI Experience
// Features: Structured responses · Case Brief · Evidence Checklist ·
//           Opponent Args · Timeline · Animated Strength Meter ·
//           Phase Indicator · Case File Sidebar · Serif bot text

'use strict';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let sessionId        = _generateSessionId();
let lastAnalysisResult = null;
let lastDraftText    = null;
let isLoading        = false;
let currentLanguage  = 'en';
let currentPhase     = 'GATHERING';

// Legal Aid Finder
let legalAidMap         = null;
let legalAidMarkers     = [];
let legalAidResults     = [];
let currentLegalAidFilter = 'all';
let userLocationMarker  = null;
let bgLocationData      = null;

// Background Location Detection (IP-based, no prompts)
fetch('https://ipapi.co/json/')
    .then(r => r.json())
    .then(data => {
        if (data && data.latitude && data.longitude) {
            bgLocationData = data;
            if (data.region) fetchDLSAForState(data.region);
        }
    }).catch(() => {});


// Chat history (sidebar) — persisted in sessionStorage
let chatHistory = _loadHistory();

// ─────────────────────────────────────────────
// SECURITY HELPERS
// ─────────────────────────────────────────────

const VALID_RISK_LEVELS = new Set(['dangerous', 'questionable', 'safe']);

function sanitizeRiskLevel(level) {
    const n = String(level || '').toLowerCase().trim();
    return VALID_RISK_LEVELS.has(n) ? n : 'safe';
}

function escapeHTML(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function _generateSessionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return 'session_' + crypto.randomUUID().replace(/-/g, '');
    }
    return 'session_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function icons() {
    if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// LANGUAGE TOGGLE
// ─────────────────────────────────────────────

function toggleLanguage() {
    currentLanguage = currentLanguage === 'en' ? 'hi' : 'en';
    const btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = currentLanguage === 'en' ? 'हिं' : 'EN';
    const input = document.getElementById('userInput');
    if (input) {
        input.placeholder = currentLanguage === 'en'
            ? 'Describe your legal problem…'
            : 'अपनी कानूनी समस्या बताएं…';
    }
    if (btn) {
        btn.classList.add('lang-active');
        setTimeout(() => btn.classList.remove('lang-active'), 400);
    }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const chatArea = document.getElementById('chatArea');
    if (chatArea) {
        chatArea.addEventListener('scroll', () => {
            const btn = document.getElementById('scrollBottomBtn');
            if (!btn) return;
            const dist = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
            btn.style.display = dist > 150 ? 'flex' : 'none';
        });
    }
    renderHistory();
    updatePhaseIndicator('GATHERING');
});

// ─────────────────────────────────────────────
// TEXTAREA AUTO-RESIZE
// ─────────────────────────────────────────────

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('visible');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
}

// ─────────────────────────────────────────────
// PHASE INDICATOR
// ─────────────────────────────────────────────

function updatePhaseIndicator(phase) {
    currentPhase = phase;
    const phases = ['GATHERING', 'ADVISING', 'DRAFTING'];
    phases.forEach((p, i) => {
        const dot = document.getElementById(`phase-dot-${i}`);
        const label = document.getElementById(`phase-label-${i}`);
        if (!dot || !label) return;

        const idx = phases.indexOf(phase);
        dot.className = 'phase-dot' + (i <= idx ? ' active' : '') + (i === idx ? ' current' : '');
        label.className = 'phase-label' + (i <= idx ? ' active' : '');
    });
}

// ─────────────────────────────────────────────
// SCROLL
// ─────────────────────────────────────────────

function scrollToBottom() {
    const chatArea = document.getElementById('chatArea');
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────

function hideEmptyState() {
    const el = document.getElementById('emptyState');
    if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
}

// ─────────────────────────────────────────────
// LOADING STATE
// ─────────────────────────────────────────────

function setLoading(loading) {
    isLoading = loading;
    const btn      = document.getElementById('sendBtn');
    const icon     = document.getElementById('sendIcon');
    const textarea = document.getElementById('userInput');

    if (loading) {
        btn.disabled = true;
        btn.classList.add('loading');
        icon.setAttribute('data-lucide', 'loader-2');
        icon.classList.add('loading-icon');
        textarea.disabled = true;
    } else {
        btn.disabled = false;
        btn.classList.remove('loading');
        icon.setAttribute('data-lucide', 'arrow-up');
        icon.classList.remove('loading-icon');
        textarea.disabled = false;
        textarea.focus();
    }
    icons();
}

// ─────────────────────────────────────────────
// STRUCTURED MESSAGE RENDERING
// ─────────────────────────────────────────────

/**
 * Parse **Section Headers** and format bot text with visual hierarchy.
 * Converts **Header** markers into styled section blocks.
 */
function formatBotMessage(text) {
    if (!text) return '';

    let html = '';
    const lines = text.split('\n');
    let buffer = [];

    function flushBuffer() {
        if (buffer.length > 0) {
            const content = buffer.join(' ').trim();
            if (content) {
                // Buffer already contains escaped+formatted HTML — do NOT re-escape
                html += `<p class="bot-para">${content}</p>`;
            }
            buffer = [];
        }
    }

    // Map header text to lucide icon names
    const iconMap = {
        'your position':        'shield-check',
        'what happened':        'file-text',
        'the facts':            'file-text',
        'the law on your side': 'scale',
        'law on your side':     'scale',
        'applicable law':       'scale',
        'what they\'ll argue':  'swords',
        'what they will argue': 'swords',
        'why they\'re wrong':   'swords',
        'what you should do':   'arrow-right-circle',
        'what to do now':       'arrow-right-circle',
        'recommended action':   'arrow-right-circle',
        'important deadlines':  'clock',
        'deadlines':            'clock',
        'limitation period':    'clock',
    };

    function getHeaderIcon(headerText) {
        const lower = headerText.toLowerCase();
        for (const [key, val] of Object.entries(iconMap)) {
            if (lower.includes(key)) return val;
        }
        return 'chevron-right';
    }

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { flushBuffer(); continue; }

        // Pattern 1: Entire line is a header — **Something**
        const fullHeaderMatch = trimmed.match(/^\*\*(.+?)\*\*$/);
        if (fullHeaderMatch) {
            flushBuffer();
            const headerText = fullHeaderMatch[1].trim();
            html += `<div class="bot-section-header">
                <i data-lucide="${getHeaderIcon(headerText)}" style="width:14px;height:14px"></i>
                <span>${escapeHTML(headerText)}</span>
            </div>`;
            continue;
        }

        // Pattern 2: Line STARTS with a header, followed by text — **Header** rest of text...
        const startHeaderMatch = trimmed.match(/^\*\*(.+?)\*\*\s*(.+)$/);
        if (startHeaderMatch) {
            flushBuffer();
            const headerText = startHeaderMatch[1].trim();
            const bodyText   = startHeaderMatch[2].trim();
            html += `<div class="bot-section-header">
                <i data-lucide="${getHeaderIcon(headerText)}" style="width:14px;height:14px"></i>
                <span>${escapeHTML(headerText)}</span>
            </div>`;
            // Process the body text for inline bold and push to buffer
            const formatted = escapeHTML(bodyText).replace(
                /\*\*(.+?)\*\*/g, '<strong>$1</strong>'
            );
            buffer.push(formatted);
            continue;
        }

        // Regular line — escape and handle inline **bold**
        const formatted = escapeHTML(trimmed).replace(
            /\*\*(.+?)\*\*/g, '<strong>$1</strong>'
        );
        buffer.push(formatted);
    }

    flushBuffer();

    if (!html.trim()) {
        return `<p class="bot-para">${escapeHTML(text)}</p>`;
    }

    return html;
}

// ─────────────────────────────────────────────
// MESSAGE RENDERERS
// ─────────────────────────────────────────────

function appendUserMessage(text) {
    hideEmptyState();
    const chatArea = document.getElementById('chatArea');
    const row = document.createElement('div');
    row.className = 'message-row user-row';
    row.innerHTML = `
        <div>
            <div class="user-bubble">${escapeHTML(text)}</div>
            <div class="msg-meta">${now()}</div>
        </div>`;
    chatArea.appendChild(row);
    scrollToBottom();
    addToHistory(text);
}

/** Create a bot message row and return the inner content element for live streaming */
function appendBotMessageStream() {
    hideEmptyState();
    const chatArea = document.getElementById('chatArea');
    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="bot-message-wrapper">
            <div class="bot-avatar"><i data-lucide="scale" style="width:14px;height:14px"></i></div>
            <div class="bot-content">
                <div class="bot-text"><p class="bot-para stream-target"></p></div>
                <div class="msg-meta">${now()}</div>
            </div>
        </div>`;
    chatArea.appendChild(row);
    icons();
    scrollToBottom();
    return row.querySelector('.stream-target');
}

function appendBotMessage(text) {
    hideEmptyState();
    const chatArea = document.getElementById('chatArea');
    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="bot-message-wrapper">
            <div class="bot-avatar"><i data-lucide="scale" style="width:14px;height:14px"></i></div>
            <div class="bot-content">
                <div class="bot-text">${formatBotMessage(text)}</div>
                <div class="msg-meta">${now()}</div>
            </div>
        </div>`;
    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

function appendThinking() {
    hideEmptyState();
    const chatArea = document.getElementById('chatArea');
    const id = 'thinking_' + Date.now();
    const row = document.createElement('div');
    row.id = id;
    row.className = 'thinking-row';
    row.innerHTML = `
        <div class="bot-avatar" style="margin-right:10px"><i data-lucide="scale" style="width:14px;height:14px"></i></div>
        <div class="thinking-bubble">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
        </div>`;
    chatArea.appendChild(row);
    icons();
    scrollToBottom();
    return id;
}

function removeThinking(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.18s ease';
    setTimeout(() => el.remove(), 200);
}

// ─────────────────────────────────────────────
// CHAT HISTORY (SIDEBAR)
// ─────────────────────────────────────────────

function _loadHistory() {
    try { return JSON.parse(sessionStorage.getItem('jb_history') || '[]'); }
    catch (_) { return []; }
}
function _saveHistory() {
    try { sessionStorage.setItem('jb_history', JSON.stringify(chatHistory)); }
    catch (_) { }
}
function addToHistory(firstMessage) {
    if (chatHistory.find(h => h.sessionId === sessionId)) return;
    const title = firstMessage.length > 48 ? firstMessage.slice(0, 48) + '…' : firstMessage;
    chatHistory.unshift({ id: Date.now(), title, sessionId, ts: Date.now() });
    if (chatHistory.length > 20) chatHistory.pop();
    _saveHistory();
    renderHistory();
}
function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    if (chatHistory.length === 0) {
        list.innerHTML = '<p class="history-empty">No recent conversations</p>';
        return;
    }
    chatHistory.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item' + (entry.sessionId === sessionId ? ' active' : '');
        item.innerHTML = `
            <span class="history-item-text">${escapeHTML(entry.title)}</span>
            <button class="history-item-del" title="Remove" onclick="removeHistory('${escapeAttr(entry.id.toString())}', event)">
                <i data-lucide="x" style="width:11px;height:11px"></i>
            </button>`;
        item.addEventListener('click', (e) => {
            if (e.target.closest('.history-item-del')) return;
            if (entry.sessionId === sessionId) { closeSidebar(); return; }

            // Switch to the selected session
            sessionId          = entry.sessionId;
            lastAnalysisResult = null;
            lastDraftText      = null;

            document.getElementById('chatArea').innerHTML = '';
            const es = document.getElementById('emptyState');
            if (es) es.classList.remove('hidden');

            updatePhaseIndicator('GATHERING');
            updateCaseFileSidebar({});
            _fetchAndUpdateCaseFile();
            renderHistory();
            closeSidebar();
        });
        list.appendChild(item);
    });
    icons();
}
function removeHistory(idStr, event) {
    event.stopPropagation();
    chatHistory = chatHistory.filter(h => h.id.toString() !== idStr);
    _saveHistory();
    renderHistory();
}

// ─────────────────────────────────────────────
// NEW CHAT
// ─────────────────────────────────────────────

async function startNewChat() {
    try {
        await fetch('/api/session/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (_) { }

    sessionId          = _generateSessionId();
    lastAnalysisResult = null;
    lastDraftText      = null;

    document.getElementById('chatArea').innerHTML = '';
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');

    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) { uploadStatus.textContent = ''; uploadStatus.style.color = ''; }

    const input = document.getElementById('userInput');
    input.value = '';
    input.style.height = 'auto';

    updatePhaseIndicator('GATHERING');
    updateCaseFileSidebar({});
    renderHistory();
    closeSidebar();
    input.focus();
}

// ─────────────────────────────────────────────
// SEND MESSAGE — with SSE streaming
// ─────────────────────────────────────────────

async function sendMessage() {
    if (isLoading) return;

    const input = document.getElementById('userInput');
    const query = input.value.trim();
    if (!query) return;

    if (query.length > 3000) {
        appendBotMessage('Your message is too long. Please keep it under 3,000 characters.');
        return;
    }

    appendUserMessage(query);
    input.value = '';
    input.style.height = 'auto';

    setLoading(true);
    const thinkingId = appendThinking();

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                session_id: sessionId,
                stream: true,
                lang: currentLanguage
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            removeThinking(thinkingId);
            appendBotMessage(err.error || 'Something went wrong. Please try again.');
            return;
        }

        // SSE Streaming
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamParagraph = null;
        let finalData = null;

        removeThinking(thinkingId);

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;

                let evt;
                try { evt = JSON.parse(raw); } catch (_) { continue; }

                if (evt.type === 'delta') {
                    if (!streamParagraph) {
                        streamParagraph = appendBotMessageStream();
                    }
                    streamParagraph.textContent += evt.text;
                    scrollToBottom();

                } else if (evt.type === 'done') {
                    finalData = evt;

                    // Re-render with structured formatting once we have full text
                    if (streamParagraph && finalData.message) {
                        const wrapper = streamParagraph.closest('.bot-text');
                        if (wrapper) {
                            wrapper.innerHTML = formatBotMessage(finalData.message);
                            icons();
                        }
                    } else if (!streamParagraph && finalData.message) {
                        appendBotMessage(finalData.message);
                    }

                } else if (evt.type === 'error') {
                    if (!streamParagraph) appendBotMessage(evt.error || 'Something went wrong.');
                    console.error('[JusticeBot] Stream error:', evt.error);
                }
            }
        }

        if (finalData) {
            lastAnalysisResult = finalData;
            updatePhaseIndicator(finalData.phase || 'GATHERING');
            _renderAnalysisEnhancements(finalData);
            // Update case file sidebar
            _fetchAndUpdateCaseFile();
        }

    } catch (err) {
        removeThinking(thinkingId);
        appendBotMessage('Connection error. Please check that the server is running.');
        console.error('[JusticeBot] sendMessage error:', err);
    } finally {
        setLoading(false);
    }
}

function handleInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// ─────────────────────────────────────────────
// CASE FILE SIDEBAR
// ─────────────────────────────────────────────

async function _fetchAndUpdateCaseFile() {
    try {
        const r = await fetch(`/api/case-file?session_id=${encodeURIComponent(sessionId)}`);
        if (r.ok) {
            const cf = await r.json();
            updateCaseFileSidebar(cf);
        }
    } catch (_) { }
}

function updateCaseFileSidebar(cf) {
    const container = document.getElementById('caseFileContent');
    if (!container) return;

    if (!cf || Object.keys(cf).length === 0) {
        container.innerHTML = '<p class="cf-empty">Start describing your problem to build your case file.</p>';
        return;
    }

    let html = '';

    // Domain
    if (cf.domain) {
        const domainLabels = {
            tenant: '🏠 Tenant / Landlord',
            consumer: '🛒 Consumer Protection',
            labour: '👷 Labour / Employment',
            rti: '📋 Right to Information',
            criminal: '⚖️ Criminal',
            family: '👨‍👩‍👧 Family',
            property: '🏗️ Property'
        };
        html += `<div class="cf-row"><span class="cf-label">Type</span><span class="cf-value">${escapeHTML(domainLabels[cf.domain] || cf.domain)}</span></div>`;
    }

    // Phase
    if (cf.phase) {
        html += `<div class="cf-row"><span class="cf-label">Phase</span><span class="cf-badge">${escapeHTML(cf.phase)}</span></div>`;
    }

    // Parties
    if (cf.parties) {
        const parties = cf.parties;
        if (parties.claimant) html += `<div class="cf-row"><span class="cf-label">You</span><span class="cf-value">${escapeHTML(parties.claimant)}</span></div>`;
        if (parties.respondent) html += `<div class="cf-row"><span class="cf-label">Opponent</span><span class="cf-value">${escapeHTML(parties.respondent)}</span></div>`;
    }

    // Amounts
    if (cf.amounts && Object.keys(cf.amounts).length > 0) {
        for (const [key, val] of Object.entries(cf.amounts)) {
            if (val) html += `<div class="cf-row"><span class="cf-label">${escapeHTML(key)}</span><span class="cf-value cf-amount">₹${escapeHTML(String(val))}</span></div>`;
        }
    }

    // Facts
    if (cf.facts && Object.keys(cf.facts).length > 0) {
        html += '<div class="cf-section-title">Key Facts</div>';
        for (const [key, val] of Object.entries(cf.facts)) {
            if (val && typeof val === 'string') {
                html += `<div class="cf-fact"><span class="cf-fact-check">✓</span><span>${escapeHTML(key)}: ${escapeHTML(val)}</span></div>`;
            }
        }
    }

    // Dates
    if (cf.dates && Object.keys(cf.dates).length > 0) {
        html += '<div class="cf-section-title">Dates</div>';
        for (const [key, val] of Object.entries(cf.dates)) {
            if (val) html += `<div class="cf-row"><span class="cf-label">${escapeHTML(key)}</span><span class="cf-value">${escapeHTML(String(val))}</span></div>`;
        }
    }

    // Documents
    if (cf.documents_held && cf.documents_held.length > 0) {
        html += '<div class="cf-section-title">Documents</div>';
        cf.documents_held.forEach(doc => {
            html += `<div class="cf-fact"><span class="cf-fact-check">📎</span><span>${escapeHTML(doc)}</span></div>`;
        });
    }

    container.innerHTML = html || '<p class="cf-empty">No case details yet.</p>';
}

// ─────────────────────────────────────────────
// RENDER ANALYSIS RESULT — v3 with rich cards
// ─────────────────────────────────────────────

function _renderAnalysisEnhancements(data) {
    const chatArea = document.getElementById('chatArea');

    if (data.phase === 'GATHERING') {
        renderActionChips(data);
        return;
    }

    if (data.phase === 'ADVISING') {
        // Case Strength Meter (animated)
        if (data.case_strength_score) {
            renderStrengthMeter(data.case_strength_score, data.case_strength, data.case_strength_factors || []);
        }

        // Legal Sections
        if (data.legal_sections && data.legal_sections.length > 0) {
            renderLegalSections(data.legal_sections);
        }

        // Opponent Arguments
        if (data.opponent_arguments && data.opponent_arguments.length > 0) {
            renderOpponentArguments(data.opponent_arguments);
        }

        // Evidence Checklist
        if (data.evidence_checklist && data.evidence_checklist.length > 0) {
            renderEvidenceChecklist(data.evidence_checklist);
        }

        // Action Timeline
        if (data.timeline && data.timeline.length > 0) {
            renderTimeline(data.timeline);
        }

        // Filing Info
        if (data.filing_info) {
            renderFilingInfo(data.filing_info);
        }

        // Escalation notice
        if (data.needs_professional) {
            renderEscalationNotice();
        }

        renderActionChips(data);
        return;
    }

    if (data.phase === 'DRAFTING') {
        if (data.draft_ready) {
            fetchAndShowDraft(data.draft_type);
        }
        renderActionChips(data);
        return;
    }

    renderActionChips(data);
}

// ─────────────────────────────────────────────
// CASE STRENGTH METER (animated)
// ─────────────────────────────────────────────

function renderStrengthMeter(score, label, factors) {
    const chatArea = document.getElementById('chatArea');

    const colors = {
        strong: { fill: 'var(--safe)',   bg: 'var(--safe-tint)',   border: 'var(--safe-border)' },
        moderate: { fill: 'var(--warn)',   bg: 'var(--warn-tint)',   border: 'var(--warn-border)' },
        weak:   { fill: 'var(--danger)', bg: 'var(--danger-tint)', border: 'var(--danger-border)' },
    };
    const tier = score >= 7 ? 'strong' : score >= 4 ? 'moderate' : 'weak';
    const c = colors[tier];

    // Generate dots
    let dots = '';
    for (let i = 1; i <= 10; i++) {
        dots += `<span class="strength-dot ${i <= score ? 'filled' : ''}" style="--dot-color:${c.fill};animation-delay:${i * 60}ms"></span>`;
    }

    // Generate factors
    let factorsHTML = '';
    if (factors.length > 0) {
        factorsHTML = '<div class="strength-factors">' +
            factors.map(f => {
                const isPositive = f.trim().startsWith('+');
                return `<div class="strength-factor ${isPositive ? 'positive' : 'negative'}">${escapeHTML(f)}</div>`;
            }).join('') +
            '</div>';
    }

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card strength-card" style="--card-border:${c.border};--card-bg:${c.bg}">
            <div class="rich-card-header">
                <i data-lucide="shield-check" style="width:16px;height:16px;color:${c.fill}"></i>
                <span>Case Strength</span>
            </div>
            <div class="strength-meter-row">
                <div class="strength-dots">${dots}</div>
                <div class="strength-score" style="color:${c.fill}">${score}/10</div>
            </div>
            <div class="strength-label" style="color:${c.fill}">${escapeHTML(label || '')}</div>
            ${factorsHTML}
        </div>`;

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// LEGAL SECTIONS
// ─────────────────────────────────────────────

function renderLegalSections(sections) {
    const chatArea = document.getElementById('chatArea');
    const sectionsHTML = sections.map(s => `
        <li class="section-item" onclick="explainSection(this)" data-section="${escapeAttr(s)}">
            <i data-lucide="scale" style="width:13px;height:13px;opacity:0.5"></i>
            <span>${escapeHTML(s)}</span>
            <span class="section-item-hint"><i data-lucide="chevron-right" style="width:12px;height:12px"></i></span>
        </li>`).join('');

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card">
            <div class="rich-card-header">
                <i data-lucide="book-open" style="width:16px;height:16px"></i>
                <span>Applicable Law</span>
            </div>
            <ul class="sections-list">${sectionsHTML}</ul>
        </div>`;

    chatArea.appendChild(row);
    icons();
}

// ─────────────────────────────────────────────
// OPPONENT ARGUMENTS CARD
// ─────────────────────────────────────────────

function renderOpponentArguments(args) {
    const chatArea = document.getElementById('chatArea');

    const argsHTML = args.map(a => `
        <div class="opp-arg-pair">
            <div class="opp-arg-their">
                <div class="opp-arg-label"><i data-lucide="user-x" style="width:12px;height:12px"></i> They'll say</div>
                <p>"${escapeHTML(a.argument)}"</p>
            </div>
            <div class="opp-arg-your">
                <div class="opp-arg-label"><i data-lucide="shield-check" style="width:12px;height:12px"></i> Your counter</div>
                <p>${escapeHTML(a.counter)}</p>
            </div>
        </div>`).join('');

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card opp-args-card">
            <div class="rich-card-header">
                <i data-lucide="swords" style="width:16px;height:16px"></i>
                <span>What They'll Argue — And Why They're Wrong</span>
            </div>
            ${argsHTML}
        </div>`;

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// EVIDENCE CHECKLIST
// ─────────────────────────────────────────────

function renderEvidenceChecklist(items) {
    const chatArea = document.getElementById('chatArea');

    const mustHave  = items.filter(i => (i.category || '').includes('must'));
    const goodHave  = items.filter(i => !(i.category || '').includes('must'));

    function renderItems(arr) {
        return arr.map(i => {
            const have = (i.status || '').toLowerCase() === 'have';
            return `<div class="evidence-item ${have ? 'have' : 'need'}">
                <span class="evidence-check">${have ? '✓' : '○'}</span>
                <span>${escapeHTML(i.item)}</span>
            </div>`;
        }).join('');
    }

    let html = '';
    if (mustHave.length > 0) {
        html += '<div class="evidence-group-label">Must Have</div>' + renderItems(mustHave);
    }
    if (goodHave.length > 0) {
        html += '<div class="evidence-group-label" style="margin-top:10px">Good to Have</div>' + renderItems(goodHave);
    }

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card evidence-card">
            <div class="rich-card-header">
                <i data-lucide="clipboard-check" style="width:16px;height:16px"></i>
                <span>Evidence Checklist</span>
            </div>
            ${html}
        </div>`;

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// ACTION TIMELINE
// ─────────────────────────────────────────────

function renderTimeline(steps) {
    const chatArea = document.getElementById('chatArea');

    const stepsHTML = steps.map((s, i) => `
        <div class="timeline-step" style="animation-delay:${i * 100}ms">
            <div class="timeline-connector">
                <div class="timeline-dot"></div>
                ${i < steps.length - 1 ? '<div class="timeline-line"></div>' : ''}
            </div>
            <div class="timeline-content">
                <div class="timeline-when">${escapeHTML(s.when || '')}</div>
                <div class="timeline-action">${escapeHTML(s.step)}</div>
                ${s.detail ? `<div class="timeline-detail">${escapeHTML(s.detail)}</div>` : ''}
            </div>
        </div>`).join('');

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card timeline-card">
            <div class="rich-card-header">
                <i data-lucide="route" style="width:16px;height:16px"></i>
                <span>Your Action Plan</span>
            </div>
            ${stepsHTML}
        </div>`;

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// FILING INFO CARD
// ─────────────────────────────────────────────

function renderFilingInfo(info) {
    const chatArea = document.getElementById('chatArea');

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card filing-card">
            <div class="rich-card-header">
                <i data-lucide="landmark" style="width:16px;height:16px"></i>
                <span>Where to File</span>
            </div>
            ${info.forum ? `<div class="filing-row"><span class="filing-label">Forum</span><span class="filing-value">${escapeHTML(info.forum)}</span></div>` : ''}
            ${info.filing_fee ? `<div class="filing-row"><span class="filing-label">Filing Fee</span><span class="filing-value filing-amount">${escapeHTML(info.filing_fee)}</span></div>` : ''}
            ${info.timeline ? `<div class="filing-row"><span class="filing-label">Typical Duration</span><span class="filing-value">${escapeHTML(info.timeline)}</span></div>` : ''}
            ${info.limitation_period ? `<div class="filing-row"><span class="filing-label">Limitation</span><span class="filing-value">${escapeHTML(info.limitation_period)}</span></div>` : ''}
            ${info.time_remaining ? `<div class="filing-deadline"><i data-lucide="clock" style="width:13px;height:13px"></i> Time remaining: <strong>${escapeHTML(info.time_remaining)}</strong></div>` : ''}
        </div>`;

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// ESCALATION NOTICE
// ─────────────────────────────────────────────

function renderEscalationNotice() {
    const chatArea = document.getElementById('chatArea');
    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div class="rich-card escalation-card">
            <div class="rich-card-header">
                <i data-lucide="alert-triangle" style="width:16px;height:16px;color:var(--warn)"></i>
                <span style="color:var(--warn)">Professional Lawyer Recommended</span>
            </div>
            <p class="escalation-text">This situation is complex enough that a professional advocate can make a real difference. Free legal aid is available:</p>
            <div class="escalation-helpline">
                <i data-lucide="phone-call" style="width:16px;height:16px"></i>
                <div>
                    <strong>NALSA Helpline: 15100</strong> (toll-free, 24/7)
                    <span>Free legal aid for eligible persons</span>
                </div>
            </div>
        </div>`;

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// ACTION CHIPS
// ─────────────────────────────────────────────

function renderActionChips(data) {
    const chatArea = document.getElementById('chatArea');
    const old = chatArea.querySelector('.action-chips');
    if (old) old.remove();

    const chips = data.action_chips || [];
    const chipActions = {
        'Draft a Legal Notice':     () => fetchAndShowDraft('notice'),
        'Draft an RTI':             () => fetchAndShowDraft('rti'),
        'Draft FIR Complaint':      () => fetchAndShowDraft('fir'),
        'Draft Consumer Complaint': () => fetchAndShowDraft('consumer'),
        'Find Legal Help Nearby':   () => openLegalAidFinder(),
        'Analyse a Document':       () => document.getElementById('docUpload').click(),
        'I have documents':         () => document.getElementById('docUpload').click(),
    };
    const chipIcons = {
        'Draft a Legal Notice':     'file-pen',
        'Draft an RTI':             'file-pen',
        'Draft FIR Complaint':      'file-pen',
        'Draft Consumer Complaint': 'file-pen',
        'Find Legal Help Nearby':   'map-pin',
        'Analyse a Document':       'paperclip',
        'I have documents':         'paperclip',
    };

    const finalChips = chips.filter(c => chipActions[c]);
    if (finalChips.length === 0 && chips.length === 0) {
        finalChips.push('Find Legal Help Nearby');
    }
    if (finalChips.length === 0) return;

    const row = document.createElement('div');
    row.className = 'action-chips';
    finalChips.forEach(label => {
        const icon = chipIcons[label] || 'zap';
        const action = chipActions[label];
        if (!action) return;
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerHTML = `<i data-lucide="${icon}" style="width:13px;height:13px"></i>${escapeHTML(label)}`;
        btn.onclick = () => { row.remove(); action(); };
        row.appendChild(btn);
    });

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// DRAFT — single unified function
// ─────────────────────────────────────────────

async function fetchAndShowDraft(draftType) {
    if (!draftType || isLoading) return;
    setLoading(true);
    const thinkingId = appendThinking();

    try {
        const response = await fetch('/api/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft_type: draftType, session_id: sessionId })
        });
        const data = await response.json();
        removeThinking(thinkingId);

        if (!response.ok || data.error) {
            appendBotMessage(data.error || 'Failed to generate draft.');
            return;
        }
        lastDraftText = data.draft;
        showDraftModal(`${draftType.toUpperCase()} — Legal Document`, data.draft);
    } catch (err) {
        removeThinking(thinkingId);
        appendBotMessage('Failed to generate draft. Please try again.');
        console.error('[JusticeBot] fetchAndShowDraft error:', err);
    } finally {
        setLoading(false);
    }
}

function requestDraft(draftType) { return fetchAndShowDraft(draftType); }
function triggerDraftFetch(draftType) { return fetchAndShowDraft(draftType); }

// ─────────────────────────────────────────────
// DOCUMENT UPLOAD & ANALYSIS
// ─────────────────────────────────────────────

async function handleDocUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const status = document.getElementById('uploadStatus');

    if (file.size > 5 * 1024 * 1024) {
        status.textContent = 'File too large (max 5 MB)';
        status.style.color = 'var(--danger)';
        event.target.value = '';
        return;
    }

    hideEmptyState();
    status.textContent = `Attached: ${file.name}`;
    status.style.color = 'var(--text-secondary)';
    appendUserMessage(`📎 ${file.name}`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    setLoading(true);
    const thinkingId = appendThinking();

    try {
        const response = await fetch('/api/document', { method: 'POST', body: formData });
        const data = await response.json();
        removeThinking(thinkingId);

        if (!response.ok || data.error) {
            status.textContent = 'Analysis failed';
            status.style.color = 'var(--danger)';
            appendBotMessage(data.error || 'Document analysis failed.');
            return;
        }

        status.textContent = `✓ ${file.name}`;
        status.style.color = 'var(--safe)';
        renderDocumentResult(data);
        setTimeout(() => { status.textContent = ''; status.style.color = ''; }, 5000);
    } catch (err) {
        removeThinking(thinkingId);
        status.textContent = 'Upload failed';
        status.style.color = 'var(--danger)';
        appendBotMessage('Document upload failed. Please try again.');
        console.error('[JusticeBot] handleDocUpload error:', err);
    } finally {
        setLoading(false);
        event.target.value = '';
    }
}

// ─────────────────────────────────────────────
// RENDER DOCUMENT RESULT
// ─────────────────────────────────────────────

function renderDocumentResult(data) {
    const chatArea = document.getElementById('chatArea');

    appendBotMessage(data.document_summary || 'Document analyzed.');

    if (data.clauses && data.clauses.length > 0) {
        const order = { dangerous: 0, questionable: 1, safe: 2 };
        const sorted = [...data.clauses].sort((a, b) =>
            (order[sanitizeRiskLevel(a.risk_level)] || 2) - (order[sanitizeRiskLevel(b.risk_level)] || 2)
        );

        const clauseRow = document.createElement('div');
        clauseRow.className = 'message-row bot-row';

        let clauseHTML = '<div class="clause-group">';
        sorted.forEach(clause => {
            const risk = sanitizeRiskLevel(clause.risk_level);
            clauseHTML += `
                <div class="clause-card ${risk}" onclick="toggleClause(this)">
                    <div class="clause-header">
                        <span class="risk-dot ${risk}"></span>
                        <span class="clause-title-text">${escapeHTML(clause.clause_title)}</span>
                        <i data-lucide="chevron-down" style="width:14px;height:14px" class="clause-toggle"></i>
                    </div>
                    <div class="clause-body">
                        ${clause.clause_text ? `<p class="clause-excerpt">${escapeHTML(clause.clause_text)}</p>` : ''}
                        <p class="clause-explanation">${escapeHTML(clause.explanation)}</p>
                        <p class="clause-recommendation">${escapeHTML(clause.recommendation)}</p>
                    </div>
                </div>`;
        });
        clauseHTML += '</div>';
        clauseRow.innerHTML = `<div style="padding:2px 24px;width:100%">${clauseHTML}</div>`;
        chatArea.appendChild(clauseRow);
    }

    icons();
    scrollToBottom();
}

function toggleClause(card) { card.classList.toggle('open'); }

// ─────────────────────────────────────────────
// SECTION EXPLANATION MODAL
// ─────────────────────────────────────────────

async function explainSection(el) {
    const sectionText = el.getAttribute('data-section');
    if (!sectionText) return;

    const overlay = document.getElementById('sectionModalOverlay');
    const modal   = document.getElementById('sectionModal');
    const title   = document.getElementById('sectionModalTitle');
    const loading = document.getElementById('sectionLoading');
    const content = document.getElementById('sectionContent');

    title.textContent      = sectionText;
    loading.style.display  = 'flex';
    content.style.display  = 'none';
    overlay.style.display  = 'block';
    modal.style.display    = 'flex';
    icons();
    document.addEventListener('keydown', _sectionEsc);

    try {
        const response = await fetch('/api/explain-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: sectionText })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            loading.innerHTML = `<p style="color:var(--danger);font-size:13px">Could not explain this section.</p>`;
            return;
        }

        document.getElementById('sectionAct').textContent         = data.act || 'N/A';
        document.getElementById('sectionExplanation').textContent = data.explanation || '';
        document.getElementById('sectionPunishment').textContent  = data.punishment || '';
        document.getElementById('sectionExample').textContent     = data.example || '';
        loading.style.display = 'none';
        content.style.display = 'block';
    } catch (err) {
        loading.innerHTML = `<p style="color:var(--danger);font-size:13px">Connection error.</p>`;
        console.error('[JusticeBot] explainSection error:', err);
    }
}

function closeSectionModal() {
    _animateModalOut('sectionModal', 'sectionModalOverlay');
    document.removeEventListener('keydown', _sectionEsc);
}
function _sectionEsc(e) { if (e.key === 'Escape') closeSectionModal(); }

// ─────────────────────────────────────────────
// DRAFT MODAL — with inline editing
// ─────────────────────────────────────────────

function showDraftModal(title, content) {
    document.getElementById('modalTitleText').textContent = title;
    const body     = document.getElementById('modalBody');
    const editArea = document.getElementById('modalEditArea');

    body.innerHTML = _formatDraftText(content);
    if (editArea) { editArea.value = content; editArea.style.display = 'none'; }
    body.style.display = 'block';

    const editBtn = document.getElementById('editDraftBtn');
    if (editBtn) editBtn.innerHTML = '<i data-lucide="pencil" style="width:14px;height:14px"></i> Edit';

    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('resultModal').style.display  = 'flex';
    icons();
    document.addEventListener('keydown', _modalEsc);
}

function showModal(title, content) { showDraftModal(title, content); }

function toggleDraftEdit() {
    const body     = document.getElementById('modalBody');
    const editArea = document.getElementById('modalEditArea');
    const editBtn  = document.getElementById('editDraftBtn');
    if (!editArea) return;

    const isEditing = editArea.style.display !== 'none';
    if (isEditing) {
        lastDraftText = editArea.value;
        body.innerHTML = _formatDraftText(lastDraftText);
        editArea.style.display = 'none';
        body.style.display     = 'block';
        if (editBtn) editBtn.innerHTML = '<i data-lucide="pencil" style="width:14px;height:14px"></i> Edit';
    } else {
        editArea.value         = lastDraftText || body.textContent;
        editArea.style.display = 'block';
        body.style.display     = 'none';
        if (editBtn) editBtn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Done';
    }
    icons();
}

function _formatDraftText(text) {
    if (!text) return '';
    // Detect headers (lines in ALL CAPS or specific patterns)
    const lines = text.split('\n');
    let html = '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { html += '<br>'; continue; }

        // Document title (all caps, short)
        if (/^[A-Z\s\/\-]{5,60}$/.test(trimmed) && trimmed.length < 60) {
            html += `<div class="draft-heading">${escapeHTML(trimmed)}</div>`;
        }
        // Numbered paragraphs
        else if (/^\d+\./.test(trimmed)) {
            html += `<p class="draft-paragraph"><span class="draft-num">${escapeHTML(trimmed.match(/^\d+\./)[0])}</span> ${escapeHTML(trimmed.replace(/^\d+\./, '').trim())}</p>`;
        }
        // Lines starting with "Date:" "From:" "To:" "Subject:"
        else if (/^(Date|From|To|Subject|Via|Ref|Dear|Sir|Madam)[\s:]/i.test(trimmed)) {
            const [label, ...rest] = trimmed.split(/:\s*/);
            html += `<p class="draft-line"><strong>${escapeHTML(label)}:</strong> ${escapeHTML(rest.join(': '))}</p>`;
        }
        else {
            html += `<p class="draft-line">${escapeHTML(trimmed)}</p>`;
        }
    }
    return html;
}

function closeModal() {
    _animateModalOut('resultModal', 'modalOverlay');
    document.removeEventListener('keydown', _modalEsc);
}
function _modalEsc(e) { if (e.key === 'Escape') closeModal(); }

function _animateModalOut(modalId, overlayId) {
    const modal   = document.getElementById(modalId);
    const overlay = document.getElementById(overlayId);
    if (!modal || !overlay) return;
    modal.style.animation   = 'modalOut 0.22s var(--ease) forwards';
    overlay.style.animation = 'fadeOut  0.22s var(--ease) forwards';
    setTimeout(() => {
        overlay.style.display = 'none';
        modal.style.display   = 'none';
        modal.style.animation = '';
        overlay.style.animation = '';
    }, 230);
}

// ─────────────────────────────────────────────
// COPY + DOWNLOAD
// ─────────────────────────────────────────────

async function copyDraftToClipboard() {
    const editArea = document.getElementById('modalEditArea');
    const text = (editArea && editArea.style.display !== 'none')
        ? editArea.value
        : (lastDraftText || document.getElementById('modalBody').textContent);

    const btn  = document.getElementById('copyDraftBtn');
    const orig = btn.innerHTML;
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
    }
    btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Copied!';
    icons();
    setTimeout(() => { btn.innerHTML = orig; icons(); }, 2000);
}

async function downloadPDF() {
    if (!lastAnalysisResult && !lastDraftText) {
        appendBotMessage('No data available. Analyze a legal query first.');
        closeModal();
        return;
    }
    const btn  = document.getElementById('downloadPdfBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:14px;height:14px" class="loading-icon"></i> Generating…';
    btn.disabled  = true;
    icons();

    try {
        const response = await fetch('/api/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analysis: lastAnalysisResult || {}, draft: lastDraftText || '', session_id: sessionId })
        });
        if (!response.ok) throw new Error('PDF generation failed');
        const blob = await response.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'JusticeBot_Report.pdf'; a.click();
        URL.revokeObjectURL(url);
        btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Downloaded!';
        icons();
        setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; icons(); }, 2200);
    } catch (err) {
        btn.innerHTML = orig; btn.disabled = false; icons();
        appendBotMessage('PDF generation failed. Please try again.');
        console.error('[JusticeBot] downloadPDF error:', err);
    }
}

// ─────────────────────────────────────────────
// LEGAL AID FINDER (preserved from v2.1)
// ─────────────────────────────────────────────

function openLegalAidFinder() {
    closeSidebar();
    document.getElementById('legalAidOverlay').style.display = 'block';
    document.getElementById('legalAidModal').style.display   = 'flex';
    icons();
    document.addEventListener('keydown', _legalAidEsc);
    setTimeout(() => {
        if (!legalAidMap) {
            initLegalAidMap();
            // Automatically use background location if we haven't searched yet
            if (bgLocationData && legalAidResults.length === 0) {
                document.getElementById('locationInput').value = `${bgLocationData.city || bgLocationData.region}, India`;
                centerMapOnLocation(bgLocationData.latitude, bgLocationData.longitude);
                searchNearbyLegalAid(bgLocationData.latitude, bgLocationData.longitude);
            }
        } else {
            legalAidMap.invalidateSize();
        }
    }, 300);
}
function closeLegalAidFinder() {
    _animateModalOut('legalAidModal', 'legalAidOverlay');
    document.removeEventListener('keydown', _legalAidEsc);
}
function _legalAidEsc(e) { if (e.key === 'Escape') closeLegalAidFinder(); }

function initLegalAidMap() {
    const mapEl = document.getElementById('legalAidMap');
    if (!mapEl || legalAidMap) return;
    legalAidMap = L.map('legalAidMap', { zoomControl: true, attributionControl: true }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19
    }).addTo(legalAidMap);
}

function setLegalAidStatus(text, type = 'info') {
    const wrap = document.getElementById('legalAidStatus');
    const span = document.getElementById('legalAidStatusText');
    wrap.style.display = 'flex'; span.textContent = text;
    wrap.className = 'legal-aid-status';
    if (type !== 'info') wrap.classList.add(`status-${type}`);
    icons();
}
function hideLegalAidStatus() { document.getElementById('legalAidStatus').style.display = 'none'; }

function autoDetectLocation() {
    const btn = document.getElementById('locationDetectBtn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:15px;height:15px" class="loading-icon"></i><span>Detecting…</span>';
    icons();
    setLegalAidStatus('Detecting your location…', 'loading');
    if (!navigator.geolocation) { setLegalAidStatus('Geolocation not supported.', 'error'); _resetDetectBtn(btn); return; }
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            setLegalAidStatus('Location found — searching…', 'loading');
            let detectedState = '';
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
                const d = await r.json();
                document.getElementById('locationInput').value = d.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                detectedState = (d.address && d.address.state) || '';
            } catch (_) { document.getElementById('locationInput').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
            centerMapOnLocation(lat, lng);
            await searchNearbyLegalAid(lat, lng);
            if (detectedState) fetchDLSAForState(detectedState);
            _resetDetectBtn(btn);
        },
        (err) => {
            const msgs = { [err.PERMISSION_DENIED]: 'Location denied.', [err.TIMEOUT]: 'Timed out.', [err.POSITION_UNAVAILABLE]: 'Position unavailable.' };
            setLegalAidStatus(msgs[err.code] || 'Could not detect.', 'error');
            _resetDetectBtn(btn);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}
function _resetDetectBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="crosshair" style="width:15px;height:15px"></i><span>Auto-detect</span>';
    icons();
}

async function searchByAddress() {
    const input = document.getElementById('locationInput');
    const address = input.value.trim();
    if (!address) { input.classList.add('flash-error'); setTimeout(() => input.classList.remove('flash-error'), 600); return; }
    setLegalAidStatus('Geocoding…', 'loading');
    try {
        const q = address.toLowerCase().includes('india') ? address : `${address}, India`;
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        const d = await r.json();
        if (!d || d.length === 0) { setLegalAidStatus('Not found. Try a different address.', 'error'); return; }
        const lat = parseFloat(d[0].lat), lng = parseFloat(d[0].lon);
        input.value = d[0].display_name;
        const state = (d[0].address || {}).state || '';
        centerMapOnLocation(lat, lng);
        setLegalAidStatus('Searching nearby resources…', 'loading');
        await searchNearbyLegalAid(lat, lng);
        if (state) fetchDLSAForState(state);
    } catch (err) { setLegalAidStatus('Geocoding failed.', 'error'); console.error(err); }
}

function centerMapOnLocation(lat, lng) {
    if (!legalAidMap) return;
    const p = document.getElementById('mapPlaceholder'); if (p) p.style.display = 'none';
    legalAidMap.setView([lat, lng], 14);
    if (userLocationMarker) legalAidMap.removeLayer(userLocationMarker);
    const icon = L.divIcon({ className: 'user-location-marker', html: '<div class="user-marker-pulse"></div><div class="user-marker-dot"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    userLocationMarker = L.marker([lat, lng], { icon }).addTo(legalAidMap).bindPopup('<strong>Your Location</strong>').openPopup();
    legalAidMap.invalidateSize();
}

function createMapMarker(result) {
    const cfg = categoryConfig[result.category] || categoryConfig.court;
    const icon = L.divIcon({ className: 'custom-map-marker', html: `<div class="map-marker-pin"><i data-lucide="${cfg.icon}" style="width:14px;height:14px;color:rgba(255,255,255,0.85)"></i></div>`, iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -42] });
    const marker = L.marker([result.lat, result.lng], { icon }).addTo(legalAidMap);
    marker.bindPopup(`<div class="map-popup"><strong>${escapeHTML(result.name)}</strong><span class="popup-category">${cfg.label}</span>${result.address ? `<span class="popup-address">${escapeHTML(result.address)}</span>` : ''}<span class="popup-distance">${result.distance.toFixed(1)} km</span>${result.phone ? `<a href="tel:${result.phone}" class="popup-phone">📞 ${escapeHTML(result.phone)}</a>` : ''}</div>`);
    setTimeout(() => icons(), 100);
    return marker;
}

const categoryConfig = { court: { icon: 'landmark', label: 'Court' }, police: { icon: 'shield', label: 'Police Station' } };
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

async function _fetchOverpass(query, timeoutMs = 12000) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
        const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), timeoutMs);
        try { const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: ctrl.signal }); clearTimeout(tid); if (!r.ok) continue; return await r.json(); } catch (_) { clearTimeout(tid); }
    }
    return null;
}

async function searchNearbyLegalAid(lat, lng) {
    legalAidMarkers.forEach(m => legalAidMap.removeLayer(m));
    legalAidMarkers = []; legalAidResults = [];
    const radius = 10000;
    const overpassQuery = `[out:json][timeout:20];(node["amenity"="courthouse"](around:${radius},${lat},${lng});way["amenity"="courthouse"](around:${radius},${lat},${lng});node["amenity"="police"](around:${radius},${lat},${lng});way["amenity"="police"](around:${radius},${lat},${lng});node["building"="government"]["name"~"court|judicial",i](around:${radius},${lat},${lng}););out center body;>;out skel qt;`;
    let usedFallback = false;
    try {
        const data = await _fetchOverpass(overpassQuery);
        if (data) {
            (data.elements || []).forEach(el => {
                const elLat = el.lat || (el.center && el.center.lat); const elLng = el.lon || (el.center && el.center.lon);
                if (!elLat || !elLng) return;
                const tags = el.tags || {};
                const name = tags.name || tags['name:en'] || _categorizePlace(tags);
                if (!name || name === 'Unknown') return;
                legalAidResults.push({ id: el.id, name, category: _getCategory(tags), lat: elLat, lng: elLng, distance: getDistanceKm(lat, lng, elLat, elLng), address: _buildAddress(tags), phone: tags.phone || tags['contact:phone'] || '', website: tags.website || '' });
            });
        } else {
            usedFallback = true;
            legalAidResults.push(...await _searchViaNominatim(lat, lng));
        }
        legalAidResults.sort((a, b) => a.distance - b.distance);
        legalAidResults.forEach(r => legalAidMarkers.push(createMapMarker(r)));
        currentLegalAidFilter = 'all';
        document.querySelectorAll('.lai-tab').forEach(t => t.classList.remove('active'));
        const allTab = document.querySelector('.lai-tab[data-category="all"]'); if (allTab) allTab.classList.add('active');
        renderLegalAidResults();
        if (legalAidResults.length > 0) {
            setLegalAidStatus(`Found ${legalAidResults.length} resources within 10 km`, 'success');
            if (legalAidMarkers.length > 0) { const group = L.featureGroup([userLocationMarker, ...legalAidMarkers]); legalAidMap.fitBounds(group.getBounds().pad(0.1)); }
        } else { setLegalAidStatus('No resources found nearby.', 'info'); }
    } catch (err) { setLegalAidStatus('Search failed.', 'error'); console.error(err); }
}

async function _searchViaNominatim(lat, lng) {
    const queries = [{ q: 'court', category: 'court' }, { q: 'district court', category: 'court' }, { q: 'police station', category: 'police' }, { q: 'police', category: 'police' }];
    const results = []; const seenIds = new Set(); const boxSize = 0.2;
    for (const { q, category } of queries) {
        try {
            const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000);
            const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&viewbox=${lng-boxSize},${lat+boxSize},${lng+boxSize},${lat-boxSize}&bounded=1&limit=8&addressdetails=1`, { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal });
            clearTimeout(tid); const d = await r.json();
            d.forEach(item => { if (seenIds.has(item.place_id)) return; seenIds.add(item.place_id); const iLat = parseFloat(item.lat); const iLng = parseFloat(item.lon); results.push({ id: item.place_id, name: item.display_name.split(',')[0].trim(), category, lat: iLat, lng: iLng, distance: getDistanceKm(lat, lng, iLat, iLng), address: item.display_name, phone: '', website: '' }); });
            await new Promise(r => setTimeout(r, 300));
        } catch (_) { }
    }
    return results;
}

function renderLegalAidResults() {
    const listEl = document.getElementById('legalAidList'); const emptyEl = document.getElementById('legalAidEmpty');
    const filtered = currentLegalAidFilter === 'all' ? legalAidResults : legalAidResults.filter(r => r.category === currentLegalAidFilter);
    listEl.querySelectorAll('.lai-card').forEach(c => c.remove());
    if (filtered.length === 0) { emptyEl.style.display = 'flex'; emptyEl.innerHTML = `<i data-lucide="search-x" style="width:36px;height:36px;opacity:0.3"></i><p>${legalAidResults.length === 0 ? 'Search a location to find<br>legal resources near you' : 'No results in this category'}</p>`; icons(); return; }
    emptyEl.style.display = 'none';
    filtered.forEach((result, idx) => {
        const cfg = categoryConfig[result.category] || categoryConfig.court;
        const card = document.createElement('div'); card.className = 'lai-card'; card.style.animationDelay = `${idx * 50}ms`;
        card.innerHTML = `<div class="lai-card-icon"><i data-lucide="${cfg.icon}" style="width:18px;height:18px"></i></div><div class="lai-card-body"><div class="lai-card-name">${escapeHTML(result.name)}</div><span class="lai-card-cat">${cfg.label}</span>${result.address ? `<span class="lai-card-addr">${escapeHTML(result.address)}</span>` : ''}<div class="lai-card-meta"><span class="lai-card-dist">${result.distance.toFixed(1)} km</span>${result.phone ? `<a href="tel:${result.phone}" class="lai-card-phone">📞 ${escapeHTML(result.phone)}</a>` : ''}</div></div><button class="lai-card-locate" onclick="focusOnMarker(${result.lat},${result.lng})" title="Show on map"><i data-lucide="map-pin" style="width:16px;height:16px"></i></button>`;
        listEl.appendChild(card);
    });
    icons();
}

function filterLegalAidResults(category) {
    currentLegalAidFilter = category;
    document.querySelectorAll('.lai-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-category') === category));
    renderLegalAidResults();
}
function focusOnMarker(lat, lng) {
    if (!legalAidMap) return; legalAidMap.setView([lat, lng], 17);
    legalAidMarkers.forEach(m => { const p = m.getLatLng(); if (Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lng - lng) < 0.0001) m.openPopup(); });
}
async function fetchDLSAForState(state) {
    const container = document.getElementById('dlsaCardContainer'); const card = document.getElementById('dlsaCard');
    if (!container || !card) return;
    const stateName = state.trim();
    if (!stateName) { container.style.display = 'none'; return; }
    try {
        const res = await fetch(`/api/dlsa?state=${encodeURIComponent(stateName)}`); const data = await res.json();
        if (!res.ok || data.error) { const short = stateName.replace(/^.*of\s+/i, '').trim(); if (short !== stateName) return fetchDLSAForState(short); container.style.display = 'none'; return; }
        card.innerHTML = `<div class="dlsa-authority">${escapeHTML(data.authority || 'Legal Services Authority')}</div><div class="dlsa-state-label">${escapeHTML(stateName)}</div>${data.address ? `<div class="dlsa-info-row"><i data-lucide="map-pin" style="width:14px;height:14px;flex-shrink:0"></i><span>${escapeHTML(data.address)}</span></div>` : ''}${data.phone ? `<div class="dlsa-info-row"><i data-lucide="phone" style="width:14px;height:14px;flex-shrink:0"></i><a href="tel:${data.phone}" class="dlsa-link">${escapeHTML(data.phone)}</a></div>` : ''}${data.email ? `<div class="dlsa-info-row"><i data-lucide="mail" style="width:14px;height:14px;flex-shrink:0"></i><a href="mailto:${data.email}" class="dlsa-link">${escapeHTML(data.email)}</a></div>` : ''}<div class="dlsa-helpline"><i data-lucide="phone-call" style="width:14px;height:14px"></i><span>NALSA Helpline: <strong>15100</strong> (toll-free)</span></div>`;
        container.style.display = 'block'; icons();
    } catch (err) { container.style.display = 'none'; console.error(err); }
}

// ─────────────────────────────────────────────
// GEO HELPERS
// ─────────────────────────────────────────────
function getDistanceKm(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180; const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2; return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
function _getCategory(tags) { if (tags.amenity === 'courthouse' || (tags.building === 'government' && /court|judicial/i.test(tags.name || ''))) return 'court'; if (tags.amenity === 'police') return 'police'; return 'court'; }
function _categorizePlace(tags) { if (tags.amenity === 'courthouse') return 'Court'; if (tags.amenity === 'police') return 'Police Station'; return 'Unknown'; }
function _buildAddress(tags) { return [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:district'], tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(', '); }

// ─────────────────────────────────────────────
// INJECTED KEYFRAMES
// ─────────────────────────────────────────────
const _ks = document.createElement('style');
_ks.textContent = `
    @keyframes modalOut { from { opacity:1; transform:translate(-50%,-50%) scale(1); } to { opacity:0; transform:translate(-50%,-48%) scale(0.97); } }
    @keyframes fadeOut { from { opacity:1; } to { opacity:0; } }
    .lang-active { transform: scale(1.15); transition: transform 0.2s ease; }
`;
document.head.appendChild(_ks);