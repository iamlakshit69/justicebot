// static/script.js
// JusticeBot v2 — Apple Dark Glass UI
// v2: Phase-based conversation · dynamic action chips · text strength badge

'use strict';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let sessionId = generateSessionId();
let lastAnalysisResult = null;
let lastDraftText = null;
let isLoading = false;

// Legal Aid Finder
let legalAidMap = null;
let legalAidMarkers = [];
let legalAidResults = [];
let currentLegalAidFilter = 'all';
let userLocationMarker = null;

// Chat history (sidebar)
let chatHistory = [];   // [{id, title, sessionId}]

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

function generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9);
}

function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function icons() {
    if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Scroll-to-bottom visibility toggle
    const chatArea = document.getElementById('chatArea');
    if (chatArea) {
        chatArea.addEventListener('scroll', () => {
            const btn = document.getElementById('scrollBottomBtn');
            if (!btn) return;
            const dist = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
            btn.style.display = dist > 150 ? 'flex' : 'none';
        });
    }
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
    const btn = document.getElementById('sendBtn');
    const icon = document.getElementById('sendIcon');
    const textarea = document.getElementById('userInput');

    if (loading) {
        btn.disabled = true;
        btn.classList.add('loading');
        // Swap icon to spinner
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

function appendBotMessage(text) {
    hideEmptyState();
    const chatArea = document.getElementById('chatArea');
    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div>
            <div class="bot-text"><p>${escapeHTML(text)}</p></div>
            <div class="msg-meta">${now()}</div>
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
        <div class="thinking-bubble">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
        </div>`;
    chatArea.appendChild(row);
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

function addToHistory(firstMessage) {
    // Only record first message of a session
    const exists = chatHistory.find(h => h.sessionId === sessionId);
    if (exists) return;

    const title = firstMessage.length > 48
        ? firstMessage.slice(0, 48) + '…'
        : firstMessage;

    const entry = { id: Date.now(), title, sessionId };
    chatHistory.unshift(entry);
    if (chatHistory.length > 20) chatHistory.pop();
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    chatHistory.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item' + (entry.sessionId === sessionId ? ' active' : '');
        item.textContent = entry.title;
        item.title = entry.title;
        list.appendChild(item);
    });
}

// ─────────────────────────────────────────────
// NEW CHAT
// ─────────────────────────────────────────────

async function startNewChat() {
    // Clear server session
    try {
        await fetch('/api/session/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (_) { }

    // Reset state
    sessionId = generateSessionId();
    lastAnalysisResult = null;
    lastDraftText = null;

    // Clear chat area and restore empty state
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = '';

    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');

    // Reset upload status
    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) {
        uploadStatus.textContent = '';
        uploadStatus.style.color = '';
    }

    // Reset textarea
    const input = document.getElementById('userInput');
    input.value = '';
    input.style.height = 'auto';

    // Update history active state
    renderHistory();

    closeSidebar();
    input.focus();
}

// ─────────────────────────────────────────────
// SEND MESSAGE
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
            body: JSON.stringify({ query, session_id: sessionId })
        });

        const data = await response.json();
        removeThinking(thinkingId);

        if (!response.ok || data.error) {
            appendBotMessage(data.error || 'Something went wrong. Please try again.');
            return;
        }

        lastAnalysisResult = data;
        renderAnalysisResult(data);

    } catch (_) {
        removeThinking(thinkingId);
        appendBotMessage('Connection error. Please check that the server is running.');
    } finally {
        setLoading(false);
    }
}

function handleInputKeydown(event) {
    // Enter sends; Shift+Enter inserts newline
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// ─────────────────────────────────────────────
// RENDER ANALYSIS RESULT — v2 phase-based
// ─────────────────────────────────────────────

function renderAnalysisResult(data) {
    // Always render the message as flat bot text
    appendBotMessage(data.message);

    // Phase-specific rendering
    if (data.phase === 'GATHERING') {
        // No cards. Just the message. Maybe chips.
        renderActionChips(data);
        return;
    }

    if (data.phase === 'ADVISING') {
        const chatArea = document.getElementById('chatArea');

        // Render legal sections (if any)
        if (data.legal_sections && data.legal_sections.length > 0) {
            renderLegalSections(data.legal_sections);
        }

        // Render case strength badge (if any)
        if (data.case_strength) {
            renderStrengthBadge(data.case_strength);
        }

        // Render escalation notice if needed
        if (data.needs_professional) {
            renderEscalationNotice();
        }

        renderActionChips(data);
        return;
    }

    if (data.phase === 'DRAFTING') {
        // If draft_ready, auto-trigger draft fetch
        if (data.draft_ready) {
            triggerDraftFetch(data.draft_type);
        }
        // Otherwise just the message (asking for missing fields)
        renderActionChips(data);
        return;
    }

    // Fallback: just render chips
    renderActionChips(data);
}

// ─────────────────────────────────────────────
// RENDER LEGAL SECTIONS
// ─────────────────────────────────────────────

function renderLegalSections(sections) {
    const chatArea = document.getElementById('chatArea');
    const group = document.createElement('div');
    group.className = 'message-row bot-row';
    group.style.flexDirection = 'column';
    group.style.alignItems = 'flex-start';

    const sectionsHTML = sections.map(s => `
        <li class="section-item"
            onclick="explainSection(this)"
            data-section="${escapeAttr(s)}">
            <span>${escapeHTML(s)}</span>
            <span class="section-item-hint">
                <i data-lucide="info" style="width:13px;height:13px"></i>
            </span>
        </li>`).join('');

    group.innerHTML = `
        <div style="padding:2px 24px;width:100%">
            <p class="result-label">Applicable Law</p>
            <div class="card-group">
                <ul class="sections-list">${sectionsHTML}</ul>
            </div>
        </div>`;

    chatArea.appendChild(group);
    icons();
}

// ─────────────────────────────────────────────
// RENDER STRENGTH BADGE — v2 text pill
// ─────────────────────────────────────────────

function renderStrengthBadge(strength) {
    // strength: "Strong" | "Moderate" | "Needs support"
    const chatArea = document.getElementById('chatArea');

    const colors = {
        'Strong':        'var(--safe)',
        'Moderate':      'var(--warn)',
        'Needs support': 'var(--danger)'
    };

    const icons_map = {
        'Strong':        'shield-check',
        'Moderate':      'shield',
        'Needs support': 'shield-alert'
    };

    const color = colors[strength] || 'var(--text-secondary)';
    const icon = icons_map[strength] || 'shield';

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div style="padding:2px 24px;width:100%">
            <p class="result-label" style="margin-top:8px">Case Strength</p>
            <div class="strength-badge" style="
                display:inline-flex;
                align-items:center;
                gap:6px;
                padding:6px 14px;
                border-radius:20px;
                background:color-mix(in srgb, ${color} 15%, transparent);
                border:1px solid color-mix(in srgb, ${color} 30%, transparent);
                color:${color};
                font-size:13px;
                font-weight:500;
            ">
                <i data-lucide="${icon}" style="width:14px;height:14px"></i>
                ${escapeHTML(strength)}
            </div>
        </div>`;

    chatArea.appendChild(row);
    icons();
}

// ─────────────────────────────────────────────
// RENDER ESCALATION NOTICE
// ─────────────────────────────────────────────

function renderEscalationNotice() {
    const chatArea = document.getElementById('chatArea');

    const row = document.createElement('div');
    row.className = 'message-row bot-row';
    row.innerHTML = `
        <div style="padding:2px 24px;width:100%">
            <div class="escalation-notice" style="
                display:flex;
                align-items:flex-start;
                gap:10px;
                padding:12px 16px;
                border-radius:12px;
                background:color-mix(in srgb, var(--warn) 8%, transparent);
                border:1px solid color-mix(in srgb, var(--warn) 20%, transparent);
                font-size:13px;
                line-height:1.5;
                color:var(--text-secondary);
                margin-top:4px;
            ">
                <i data-lucide="alert-triangle" style="width:16px;height:16px;color:var(--warn);flex-shrink:0;margin-top:2px"></i>
                <span>
                    This situation is complex enough that a professional lawyer can make a real difference.
                    Free legal aid: <strong style="color:var(--text-primary)">NALSA 15100</strong> (toll-free)
                </span>
            </div>
        </div>`;

    chatArea.appendChild(row);
    icons();
}

// ─────────────────────────────────────────────
// ACTION CHIPS — v2 dynamic from API
// ─────────────────────────────────────────────

function renderActionChips(data) {
    const chatArea = document.getElementById('chatArea');

    // Remove any previous chip row
    const old = chatArea.querySelector('.action-chips');
    if (old) old.remove();

    const chips = data.action_chips || [];

    // Map chip label to action
    const chipActions = {
        'Draft a Legal Notice':     () => requestDraft('notice'),
        'Draft an RTI':             () => requestDraft('rti'),
        'Draft FIR Complaint':      () => requestDraft('fir'),
        'Draft Consumer Complaint': () => requestDraft('consumer'),
        'Find Legal Help Nearby':   () => openLegalAidFinder(),
        'Analyse a Document':       () => document.getElementById('docUpload').click(),
        'I have documents':         () => document.getElementById('docUpload').click(),
    };

    // Map chip labels to icons
    const chipIcons = {
        'Draft a Legal Notice':     'file-pen',
        'Draft an RTI':             'file-pen',
        'Draft FIR Complaint':      'file-pen',
        'Draft Consumer Complaint': 'file-pen',
        'Find Legal Help Nearby':   'map-pin',
        'Analyse a Document':       'paperclip',
        'I have documents':         'paperclip',
    };

    // Render only chips that have a known action
    const validChips = chips.filter(c => chipActions[c]);

    // Fallback: if no valid chips from the API, show basic helpers
    if (validChips.length === 0 && chips.length === 0) {
        validChips.push('Find Legal Help Nearby');
        validChips.push('Analyse a Document');
    }

    const finalChips = validChips.filter(c => chipActions[c]);
    if (finalChips.length === 0) return;

    const row = document.createElement('div');
    row.className = 'action-chips';

    finalChips.forEach(label => {
        const icon = chipIcons[label] || 'zap';
        const action = chipActions[label];
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.innerHTML = `<i data-lucide="${icon}" style="width:13px;height:13px"></i>${escapeHTML(label)}`;
        btn.onclick = () => {
            row.remove();   // chips disappear once clicked
            action();
        };
        row.appendChild(btn);
    });

    chatArea.appendChild(row);
    icons();
    scrollToBottom();
}

// ─────────────────────────────────────────────
// TRIGGER DRAFT FETCH — v2 auto-draft
// ─────────────────────────────────────────────

async function triggerDraftFetch(draftType) {
    if (!draftType) return;
    if (isLoading) return;

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
        showModal(`Draft ${draftType.toUpperCase()} Document`, data.draft);

    } catch (_) {
        removeThinking(thinkingId);
        appendBotMessage('Failed to generate draft. Please try again.');
    } finally {
        setLoading(false);
    }
}

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

    // Show user bubble with filename
    appendUserMessage(`📎 ${file.name}`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    setLoading(true);
    const thinkingId = appendThinking();

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
            appendBotMessage(data.error || 'Document analysis failed.');
            return;
        }

        status.textContent = `✓ ${file.name}`;
        status.style.color = 'var(--safe)';
        renderDocumentResult(data);

        setTimeout(() => {
            status.textContent = '';
            status.style.color = '';
        }, 5000);

    } catch (_) {
        removeThinking(thinkingId);
        status.textContent = 'Upload failed';
        status.style.color = 'var(--danger)';
        appendBotMessage('Document upload failed. Please try again.');
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

    // Summary as flat bot text
    const summaryRow = document.createElement('div');
    summaryRow.className = 'message-row bot-row';
    summaryRow.innerHTML = `
        <div>
            <div class="bot-text">
                <p>${escapeHTML(data.document_summary)}</p>
                <p style="color:var(--text-tertiary);font-size:12px;margin-top:4px">
                    ${data.total_clauses_reviewed || data.clauses.length} clauses reviewed
                </p>
            </div>
            <div class="msg-meta">${now()}</div>
        </div>`;
    chatArea.appendChild(summaryRow);

    // Clause cards — expandable inset list
    if (data.clauses && data.clauses.length > 0) {
        const clauseRow = document.createElement('div');
        clauseRow.className = 'message-row bot-row';

        // Sort: dangerous → questionable → safe
        const order = { dangerous: 0, questionable: 1, safe: 2 };
        const sorted = [...data.clauses].sort((a, b) =>
            (order[sanitizeRiskLevel(a.risk_level)] || 2) -
            (order[sanitizeRiskLevel(b.risk_level)] || 2)
        );

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
                        ${clause.clause_text ? `
                            <p class="clause-excerpt">${escapeHTML(clause.clause_text)}</p>` : ''}
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

function toggleClause(card) {
    card.classList.toggle('open');
}

// ─────────────────────────────────────────────
// REQUEST DRAFT DOCUMENT
// ─────────────────────────────────────────────

async function requestDraft(draftType) {
    if (isLoading) return;

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
        showModal(`Draft ${draftType.toUpperCase()} Document`, data.draft);

    } catch (_) {
        removeThinking(thinkingId);
        appendBotMessage('Failed to generate draft. Please try again.');
    } finally {
        setLoading(false);
    }
}

// ─────────────────────────────────────────────
// SECTION EXPLANATION MODAL
// ─────────────────────────────────────────────

async function explainSection(el) {
    const sectionText = el.getAttribute('data-section');
    if (!sectionText) return;

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
            loading.innerHTML = `<p style="color:var(--danger);font-size:13px">Could not explain this section. Please try again.</p>`;
            return;
        }

        document.getElementById('sectionAct').textContent = data.act || 'N/A';
        document.getElementById('sectionExplanation').textContent = data.explanation || 'No explanation available.';
        document.getElementById('sectionPunishment').textContent = data.punishment || 'Not specified.';
        document.getElementById('sectionExample').textContent = data.example || 'No example available.';

        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (_) {
        loading.innerHTML = `<p style="color:var(--danger);font-size:13px">Connection error. Please try again.</p>`;
    }
}

function closeSectionModal() {
    _animateModalOut('sectionModal', 'sectionModalOverlay');
    document.removeEventListener('keydown', _sectionEsc);
}

function _sectionEsc(e) { if (e.key === 'Escape') closeSectionModal(); }

// ─────────────────────────────────────────────
// DRAFT MODAL
// ─────────────────────────────────────────────

function showModal(title, content) {
    document.getElementById('modalTitleText').textContent = title;

    const body = document.getElementById('modalBody');
    body.innerHTML = _formatDraftText(content);

    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('resultModal').style.display = 'flex';
    icons();

    document.addEventListener('keydown', _modalEsc);
}

function _formatDraftText(text) {
    if (!text) return '';
    let t = escapeHTML(text);
    t = t.replace(/\n\n/g, '</p><p>');
    t = t.replace(/\n/g, '<br>');
    return `<p>${t}</p>`;
}

function closeModal() {
    _animateModalOut('resultModal', 'modalOverlay');
    document.removeEventListener('keydown', _modalEsc);
}

function _modalEsc(e) { if (e.key === 'Escape') closeModal(); }

function _animateModalOut(modalId, overlayId) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById(overlayId);
    if (!modal || !overlay) return;

    modal.style.animation = 'modalOut 0.22s var(--ease) forwards';
    overlay.style.animation = 'fadeOut  0.22s var(--ease) forwards';

    setTimeout(() => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
        modal.style.animation = '';
        overlay.style.animation = '';
    }, 230);
}

// ─────────────────────────────────────────────
// COPY + DOWNLOAD
// ─────────────────────────────────────────────

async function copyDraftToClipboard() {
    const text = lastDraftText || document.getElementById('modalBody').textContent;
    const btn = document.getElementById('copyDraftBtn');
    const orig = btn.innerHTML;

    try {
        await navigator.clipboard.writeText(text);
    } catch (_) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Copied!';
    icons();
    setTimeout(() => { btn.innerHTML = orig; icons(); }, 2000);
}

async function downloadPDF() {
    if (!lastAnalysisResult && !lastDraftText) {
        appendBotMessage('No analysis data available. Please analyze a legal query first.');
        closeModal();
        return;
    }

    const btn = document.getElementById('downloadPdfBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:14px;height:14px" class="loading-icon"></i> Generating…';
    btn.disabled = true;
    icons();

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

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'PDF generation failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'JusticeBot_Report.pdf';
        a.click();
        URL.revokeObjectURL(url);

        btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Downloaded!';
        icons();
        setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; icons(); }, 2200);

    } catch (_) {
        btn.innerHTML = orig;
        btn.disabled = false;
        icons();
        appendBotMessage('PDF generation failed. Please try again.');
    }
}

// ─────────────────────────────────────────────
// LEGAL AID FINDER
// ─────────────────────────────────────────────

function openLegalAidFinder() {
    closeSidebar();
    const overlay = document.getElementById('legalAidOverlay');
    const modal = document.getElementById('legalAidModal');
    overlay.style.display = 'block';
    modal.style.display = 'flex';
    icons();

    document.addEventListener('keydown', _legalAidEsc);

    setTimeout(() => {
        if (!legalAidMap) {
            initLegalAidMap();
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

    legalAidMap = L.map('legalAidMap', {
        zoomControl: true,
        attributionControl: true
    }).setView([20.5937, 78.9629], 5);

    // Dark Carto tiles matching the app theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(legalAidMap);
}

function setLegalAidStatus(text, type = 'info') {
    const wrap = document.getElementById('legalAidStatus');
    const span = document.getElementById('legalAidStatusText');
    wrap.style.display = 'flex';
    span.textContent = text;
    wrap.className = 'legal-aid-status';
    if (type !== 'info') wrap.classList.add(`status-${type}`);
    icons();
}

function hideLegalAidStatus() {
    document.getElementById('legalAidStatus').style.display = 'none';
}

// ── Auto-detect ──

function autoDetectLocation() {
    const btn = document.getElementById('locationDetectBtn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:15px;height:15px" class="loading-icon"></i><span>Detecting…</span>';
    icons();

    setLegalAidStatus('Detecting your location…', 'loading');

    if (!navigator.geolocation) {
        setLegalAidStatus('Geolocation is not supported by your browser.', 'error');
        _resetDetectBtn(btn);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            setLegalAidStatus('Location found — searching nearby resources…', 'loading');

            let detectedState = '';
            try {
                const r = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const d = await r.json();
                document.getElementById('locationInput').value = d.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                detectedState = (d.address && d.address.state) || '';
            } catch (_) {
                document.getElementById('locationInput').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }

            centerMapOnLocation(lat, lng);
            await searchNearbyLegalAid(lat, lng);
            if (detectedState) fetchDLSAForState(detectedState);
            _resetDetectBtn(btn);
        },
        (err) => {
            const msgs = {
                [err.PERMISSION_DENIED]: 'Location access denied. Please enable permission or enter an address.',
                [err.TIMEOUT]: 'Location request timed out. Please try again.',
                [err.POSITION_UNAVAILABLE]: 'Position unavailable. Please enter your address.',
            };
            setLegalAidStatus(msgs[err.code] || 'Could not detect location.', 'error');
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

// ── Search by address ──

async function searchByAddress() {
    const input = document.getElementById('locationInput');
    const address = input.value.trim();
    if (!address) {
        input.classList.add('flash-error');
        setTimeout(() => input.classList.remove('flash-error'), 600);
        return;
    }

    setLegalAidStatus('Geocoding…', 'loading');

    try {
        const q = address.toLowerCase().includes('india') ? address : `${address}, India`;
        const r = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const d = await r.json();

        if (!d || d.length === 0) {
            setLegalAidStatus('Location not found. Try a different address or pincode.', 'error');
            return;
        }

        const lat = parseFloat(d[0].lat);
        const lng = parseFloat(d[0].lon);
        input.value = d[0].display_name;

        const state = (d[0].address || {}).state || '';
        centerMapOnLocation(lat, lng);
        setLegalAidStatus('Searching nearby courts & police stations…', 'loading');
        await searchNearbyLegalAid(lat, lng);
        if (state) fetchDLSAForState(state);

    } catch (_) {
        setLegalAidStatus('Geocoding failed. Please try again.', 'error');
    }
}

// ── Map helpers ──

function centerMapOnLocation(lat, lng) {
    if (!legalAidMap) return;

    const placeholder = document.getElementById('mapPlaceholder');
    if (placeholder) placeholder.style.display = 'none';

    legalAidMap.setView([lat, lng], 14);

    if (userLocationMarker) legalAidMap.removeLayer(userLocationMarker);

    const icon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-marker-pulse"></div><div class="user-marker-dot"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    userLocationMarker = L.marker([lat, lng], { icon })
        .addTo(legalAidMap)
        .bindPopup('<strong>Your Location</strong>')
        .openPopup();

    legalAidMap.invalidateSize();
}

function createMapMarker(result) {
    const cfg = categoryConfig[result.category] || categoryConfig.court;
    const icon = L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="map-marker-pin">
                   <i data-lucide="${cfg.icon}" style="width:14px;height:14px;color:rgba(255,255,255,0.85)"></i>
               </div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -42]
    });

    const marker = L.marker([result.lat, result.lng], { icon }).addTo(legalAidMap);
    marker.bindPopup(`
        <div class="map-popup">
            <strong>${escapeHTML(result.name)}</strong>
            <span class="popup-category">${cfg.label}</span>
            ${result.address ? `<span class="popup-address">${escapeHTML(result.address)}</span>` : ''}
            <span class="popup-distance">${result.distance.toFixed(1)} km away</span>
            ${result.phone ? `<a href="tel:${result.phone}" class="popup-phone">📞 ${escapeHTML(result.phone)}</a>` : ''}
        </div>`);

    setTimeout(() => icons(), 100);
    return marker;
}

const categoryConfig = {
    court: { icon: 'landmark', label: 'Court' },
    police: { icon: 'shield', label: 'Police Station' },
};

// ── Overpass / Nominatim search ──

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function _fetchOverpass(query, timeoutMs = 12000) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const r = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
                signal: ctrl.signal,
            });
            clearTimeout(tid);
            if (!r.ok) continue;
            return await r.json();
        } catch (_) {
            clearTimeout(tid);
        }
    }
    return null;
}

async function _searchViaNominatim(lat, lng) {
    const queries = [
        { q: 'court', category: 'court' },
        { q: 'district court', category: 'court' },
        { q: 'police station', category: 'police' },
        { q: 'police', category: 'police' },
    ];

    const results = [];
    const seenIds = new Set();
    const boxSize = 0.2;

    for (const { q, category } of queries) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const r = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}` +
                `&viewbox=${lng - boxSize},${lat + boxSize},${lng + boxSize},${lat - boxSize}` +
                `&bounded=1&limit=8&addressdetails=1`,
                { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal }
            );
            clearTimeout(tid);
            const d = await r.json();
            d.forEach(item => {
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
            await new Promise(r => setTimeout(r, 300)); // Nominatim rate limit
        } catch (_) { }
    }
    return results;
}

async function searchNearbyLegalAid(lat, lng) {
    legalAidMarkers.forEach(m => legalAidMap.removeLayer(m));
    legalAidMarkers = [];
    legalAidResults = [];

    const radius = 10000;
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
        const overpassData = await _fetchOverpass(overpassQuery);

        if (overpassData) {
            (overpassData.elements || []).forEach(el => {
                const elLat = el.lat || (el.center && el.center.lat);
                const elLng = el.lon || (el.center && el.center.lon);
                if (!elLat || !elLng) return;
                const tags = el.tags || {};
                const name = tags.name || tags['name:en'] || _categorizePlace(tags);
                if (!name || name === 'Unknown') return;
                legalAidResults.push({
                    id: el.id,
                    name,
                    category: _getCategory(tags),
                    lat: elLat,
                    lng: elLng,
                    distance: getDistanceKm(lat, lng, elLat, elLng),
                    address: _buildAddress(tags),
                    phone: tags.phone || tags['contact:phone'] || '',
                    website: tags.website || tags['contact:website'] || '',
                });
            });
        } else {
            usedFallback = true;
            legalAidResults.push(...await _searchViaNominatim(lat, lng));
        }

        legalAidResults.sort((a, b) => a.distance - b.distance);
        legalAidResults.forEach(r => legalAidMarkers.push(createMapMarker(r)));

        currentLegalAidFilter = 'all';
        document.querySelectorAll('.lai-tab').forEach(t => t.classList.remove('active'));
        const allTab = document.querySelector('.lai-tab[data-category="all"]');
        if (allTab) allTab.classList.add('active');
        renderLegalAidResults();

        if (legalAidResults.length > 0) {
            const note = usedFallback ? ' (via Nominatim)' : '';
            setLegalAidStatus(`Found ${legalAidResults.length} legal resources within 10 km${note}`, 'success');
            if (legalAidMarkers.length > 0) {
                const group = L.featureGroup([userLocationMarker, ...legalAidMarkers]);
                legalAidMap.fitBounds(group.getBounds().pad(0.1));
            }
        } else {
            setLegalAidStatus('No resources found nearby. Try a wider search or a city centre.', 'info');
        }

    } catch (_) {
        setLegalAidStatus('Search failed. Please try again.', 'error');
    }
}

function renderLegalAidResults() {
    const listEl = document.getElementById('legalAidList');
    const emptyEl = document.getElementById('legalAidEmpty');

    const filtered = currentLegalAidFilter === 'all'
        ? legalAidResults
        : legalAidResults.filter(r => r.category === currentLegalAidFilter);

    listEl.querySelectorAll('.lai-card').forEach(c => c.remove());

    if (filtered.length === 0) {
        emptyEl.style.display = 'flex';
        emptyEl.innerHTML = `
            <i data-lucide="search-x" style="width:36px;height:36px;opacity:0.3"></i>
            <p>${legalAidResults.length === 0
                ? 'Search a location to find<br>legal resources near you'
                : 'No results in this category'}</p>`;
        icons();
        return;
    }

    emptyEl.style.display = 'none';

    filtered.forEach((result, idx) => {
        const cfg = categoryConfig[result.category] || categoryConfig.court;
        const card = document.createElement('div');
        card.className = 'lai-card';
        card.style.animationDelay = `${idx * 50}ms`;
        card.innerHTML = `
            <div class="lai-card-icon">
                <i data-lucide="${cfg.icon}" style="width:18px;height:18px"></i>
            </div>
            <div class="lai-card-body">
                <div class="lai-card-name">${escapeHTML(result.name)}</div>
                <span class="lai-card-cat">${cfg.label}</span>
                ${result.address ? `<span class="lai-card-addr">${escapeHTML(result.address)}</span>` : ''}
                <div class="lai-card-meta">
                    <span class="lai-card-dist">${result.distance.toFixed(1)} km</span>
                    ${result.phone ? `<a href="tel:${result.phone}" class="lai-card-phone">📞 ${escapeHTML(result.phone)}</a>` : ''}
                </div>
            </div>
            <button class="lai-card-locate" onclick="focusOnMarker(${result.lat},${result.lng})" title="Show on map">
                <i data-lucide="map-pin" style="width:16px;height:16px"></i>
            </button>`;
        listEl.appendChild(card);
    });
    icons();
}

function filterLegalAidResults(category) {
    currentLegalAidFilter = category;
    document.querySelectorAll('.lai-tab').forEach(t =>
        t.classList.toggle('active', t.getAttribute('data-category') === category));
    renderLegalAidResults();
}

function focusOnMarker(lat, lng) {
    if (!legalAidMap) return;
    legalAidMap.setView([lat, lng], 17);
    legalAidMarkers.forEach(m => {
        const p = m.getLatLng();
        if (Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lng - lng) < 0.0001) m.openPopup();
    });
}

// ── DLSA card ──

async function fetchDLSAForState(state) {
    const container = document.getElementById('dlsaCardContainer');
    const card = document.getElementById('dlsaCard');
    if (!container || !card) return;

    const stateName = state.trim();
    if (!stateName) { container.style.display = 'none'; return; }

    try {
        const res = await fetch(`/api/dlsa?state=${encodeURIComponent(stateName)}`);
        const data = await res.json();

        if (!res.ok || data.error) {
            // Try stripping "National Capital Territory of …" etc.
            const short = stateName.replace(/^.*of\s+/i, '').trim();
            if (short !== stateName) return fetchDLSAForState(short);
            container.style.display = 'none';
            return;
        }

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
            </div>`;

        container.style.display = 'block';
        icons();

    } catch (_) {
        container.style.display = 'none';
    }
}

// ─────────────────────────────────────────────
// GEO HELPERS
// ─────────────────────────────────────────────

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _getCategory(tags) {
    if (tags.amenity === 'courthouse' ||
        (tags.building === 'government' && /court|judicial/i.test(tags.name || '')))
        return 'court';
    if (tags.amenity === 'police') return 'police';
    return 'court';
}

function _categorizePlace(tags) {
    if (tags.amenity === 'courthouse') return 'Court';
    if (tags.amenity === 'police') return 'Police Station';
    return 'Unknown';
}

function _buildAddress(tags) {
    return [
        tags['addr:housenumber'],
        tags['addr:street'],
        tags['addr:city'],
        tags['addr:district'],
        tags['addr:state'],
        tags['addr:postcode']
    ].filter(Boolean).join(', ');
}

// ─────────────────────────────────────────────
// INJECTED KEYFRAMES
// ─────────────────────────────────────────────

const _ks = document.createElement('style');
_ks.textContent = `
    @keyframes modalOut {
        from { opacity:1; transform:translate(-50%,-50%) scale(1); }
        to   { opacity:0; transform:translate(-50%,-48%) scale(0.97); }
    }
    @keyframes fadeOut {
        from { opacity:1; }
        to   { opacity:0; }
    }
`;
document.head.appendChild(_ks);