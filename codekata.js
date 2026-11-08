/**
 * PhoolGuvi — CodeKata Paste Helper (MAIN world)
 *
 * Injects a floating panel on GUVI CodeKata pages that lets users
 * paste code directly into the Ace editor with one click.
 * Runs in MAIN world to access window.ace on the page.
 */
(function PhoolGuviCodeKata() {
    "use strict";

    const TAG = "[PhoolGuvi CodeKata]";
    const PANEL_ID = "phoolguvi-codekata-panel";
    const POLL_INTERVAL_MS = 1500;

    // ── State ──────────────────────────────────────────────────
    let panelMinimized = false;
    let editorReady = false;

    // ── Ace Editor Access ──────────────────────────────────────
    /**
     * Find the Ace editor instance on the page.
     * @returns {object|null} Ace editor instance or null
     */
    function getAceEditor() {
        const el = document.querySelector(".ace_editor");
        if (!el || !window.ace) return null;
        try {
            return window.ace.edit(el);
        } catch (err) {
            console.warn(TAG, "Could not access Ace editor:", err);
            return null;
        }
    }

    /**
     * Inject code string into the Ace editor.
     * @param {string} code - The code to paste
     * @returns {boolean} Whether the paste was successful
     */
    function pasteIntoEditor(code) {
        const editor = getAceEditor();
        if (!editor) {
            console.error(TAG, "Ace editor not found on this page.");
            return false;
        }
        editor.setValue(code, -1);  // -1 moves cursor to start (avoids full selection)
        editor.clearSelection();
        editor.focus();
        console.log(TAG, "✅ Code successfully pasted into CodeKata editor!");
        return true;
    }

    // Also expose globally for console use (matches original re founds.js behavior)
    window.setCode = function (codeString) {
        return pasteIntoEditor(codeString);
    };

    // ── Panel UI ───────────────────────────────────────────────
    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const root = document.body || document.documentElement;
        if (!root) return;

        const panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="codekata-header">
                <div class="codekata-brand">
                    <span class="codekata-icon">📋</span>
                    <span class="codekata-title">Paste Code</span>
                </div>
                <div class="codekata-header-actions">
                    <button class="codekata-btn codekata-btn-minimize" id="codekata-minimize" title="Minimize">─</button>
                    <button class="codekata-btn codekata-btn-close" id="codekata-close" title="Close panel">✕</button>
                </div>
            </div>
            <div class="codekata-body" id="codekata-body">
                <textarea
                    id="codekata-textarea"
                    placeholder="Paste your code here…"
                    spellcheck="false"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                ></textarea>
                <div class="codekata-actions">
                    <button class="codekata-btn codekata-btn-clear" id="codekata-clear">Clear</button>
                    <button class="codekata-btn codekata-btn-paste" id="codekata-paste">
                        <span class="codekata-paste-icon">⚡</span> Inject into Editor
                    </button>
                </div>
                <div class="codekata-status" id="codekata-status"></div>
            </div>
        `;

        root.appendChild(panel);
        bindPanelEvents();
        pollEditorReady();
    }

    function bindPanelEvents() {
        const textarea  = document.getElementById("codekata-textarea");
        const pasteBtn  = document.getElementById("codekata-paste");
        const clearBtn  = document.getElementById("codekata-clear");
        const minBtn    = document.getElementById("codekata-minimize");
        const closeBtn  = document.getElementById("codekata-close");
        const body      = document.getElementById("codekata-body");
        const panel     = document.getElementById(PANEL_ID);

        // Inject code
        if (pasteBtn) {
            pasteBtn.addEventListener("click", () => {
                const code = textarea?.value;
                if (!code || !code.trim()) {
                    showStatus("⚠ Paste some code first!", "warn");
                    return;
                }
                const success = pasteIntoEditor(code);
                if (success) {
                    showStatus("✅ Code injected successfully!", "success");
                    pasteBtn.classList.add("codekata-btn-success-flash");
                    setTimeout(() => pasteBtn.classList.remove("codekata-btn-success-flash"), 800);
                } else {
                    showStatus("❌ Ace editor not found — is this a CodeKata page?", "error");
                }
            });
        }

        // Clear textarea
        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                if (textarea) {
                    textarea.value = "";
                    textarea.focus();
                }
                showStatus("");
            });
        }

        // Minimize / expand
        if (minBtn) {
            minBtn.addEventListener("click", () => {
                panelMinimized = !panelMinimized;
                if (body) body.style.display = panelMinimized ? "none" : "";
                minBtn.textContent = panelMinimized ? "□" : "─";
                minBtn.title = panelMinimized ? "Expand" : "Minimize";
                if (panel) panel.classList.toggle("codekata-minimized", panelMinimized);
            });
        }

        // Close panel (can reopen via console: document.getElementById('phoolguvi-codekata-panel').style.display='')
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                if (panel) panel.style.display = "none";
                showReopenFab();
            });
        }

        // Keyboard shortcut: Ctrl+Enter to inject
        if (textarea) {
            textarea.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    pasteBtn?.click();
                }
            });
        }
    }

    // ── Reopen FAB (after closing panel) ───────────────────────
    function showReopenFab() {
        if (document.getElementById("codekata-reopen")) return;

        const fab = document.createElement("button");
        fab.id = "codekata-reopen";
        fab.title = "Reopen Paste Code panel";
        fab.textContent = "📋";
        fab.addEventListener("click", () => {
            const panel = document.getElementById(PANEL_ID);
            if (panel) panel.style.display = "";
            fab.remove();
        });

        (document.body || document.documentElement).appendChild(fab);
    }

    // ── Status Feedback ────────────────────────────────────────
    function showStatus(message, type = "") {
        const el = document.getElementById("codekata-status");
        if (!el) return;
        el.textContent = message;
        el.className = "codekata-status";
        if (type) el.classList.add(`codekata-status-${type}`);
    }

    // ── Editor Readiness Polling ───────────────────────────────
    function pollEditorReady() {
        const check = setInterval(() => {
            const editor = getAceEditor();
            if (editor) {
                editorReady = true;
                clearInterval(check);
                showStatus("✓ Ace editor detected — ready to paste", "success");
                console.log(TAG, "Ace editor is ready.");
            }
        }, POLL_INTERVAL_MS);

        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(check), 30000);
    }

    // ── Inject Panel Styles (inline, since this runs in MAIN world) ─
    function injectStyles() {
        if (document.getElementById("phoolguvi-codekata-styles")) return;

        const style = document.createElement("style");
        style.id = "phoolguvi-codekata-styles";
        style.textContent = `
            /* ── CodeKata Paste Panel ────────────────────────── */
            #${PANEL_ID} {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                width: 360px;
                border: 1px solid rgba(51, 65, 85, 0.5);
                border-radius: 14px;
                background: rgba(15, 23, 42, 0.92);
                backdrop-filter: blur(18px) saturate(1.6);
                -webkit-backdrop-filter: blur(18px) saturate(1.6);
                color: #f1f5f9;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(51, 65, 85, 0.45);
                font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                line-height: 1.5;
                user-select: none;
                animation: codekata-fadein 0.35s ease-out;
                overflow: hidden;
            }

            #${PANEL_ID}.codekata-minimized {
                width: auto;
            }

            @keyframes codekata-fadein {
                from { opacity: 0; transform: translateY(12px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }

            /* Header */
            .codekata-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(51, 65, 85, 0.45);
                cursor: default;
            }

            .codekata-brand {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .codekata-icon {
                font-size: 16px;
            }

            .codekata-title {
                font-size: 13px;
                font-weight: 700;
                letter-spacing: -0.01em;
                background: linear-gradient(90deg, #a78bfa, #818cf8, #a78bfa);
                background-size: 200% auto;
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
                animation: codekata-shimmer 4s linear infinite;
            }

            @keyframes codekata-shimmer {
                0%   { background-position: -200% center; }
                100% { background-position: 200% center; }
            }

            .codekata-header-actions {
                display: flex;
                gap: 4px;
            }

            /* Body */
            .codekata-body {
                padding: 14px 16px 16px;
            }

            /* Textarea */
            #codekata-textarea {
                display: block;
                width: 100%;
                height: 150px;
                padding: 10px 12px;
                border: 1px solid rgba(51, 65, 85, 0.45);
                border-radius: 8px;
                background: rgba(15, 23, 42, 0.6);
                color: #fbbf24;
                font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 12px;
                line-height: 1.6;
                resize: vertical;
                outline: none;
                transition: border-color 0.25s ease;
                user-select: text;
            }

            #codekata-textarea:focus {
                border-color: #818cf8;
                box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.15);
            }

            #codekata-textarea::placeholder {
                color: #64748b;
            }

            #codekata-textarea::-webkit-scrollbar { width: 4px; }
            #codekata-textarea::-webkit-scrollbar-track { background: transparent; }
            #codekata-textarea::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.5); border-radius: 4px; }

            /* Actions Row */
            .codekata-actions {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                margin-top: 10px;
            }

            /* Buttons */
            .codekata-btn {
                border: none;
                border-radius: 8px;
                font-family: inherit;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                outline: none;
                transition: all 0.2s ease;
                user-select: none;
            }

            .codekata-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.1);
            }

            .codekata-btn:active {
                transform: translateY(0);
                filter: brightness(0.95);
            }

            .codekata-btn-paste {
                flex: 1;
                padding: 8px 16px;
                background: linear-gradient(135deg, #7c3aed, #6d28d9);
                color: #fff;
                box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
                letter-spacing: 0.02em;
            }

            .codekata-btn-paste:hover {
                box-shadow: 0 4px 14px rgba(124, 58, 237, 0.45);
            }

            .codekata-paste-icon {
                margin-right: 4px;
            }

            .codekata-btn-success-flash {
                background: linear-gradient(135deg, #10b981, #059669) !important;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4) !important;
            }

            .codekata-btn-clear {
                padding: 8px 14px;
                background: rgba(51, 65, 85, 0.5);
                color: #94a3b8;
            }

            .codekata-btn-clear:hover {
                background: rgba(51, 65, 85, 0.7);
                color: #f1f5f9;
            }

            .codekata-btn-minimize,
            .codekata-btn-close {
                width: 26px;
                height: 26px;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                color: #64748b;
                font-size: 12px;
                border-radius: 6px;
            }

            .codekata-btn-minimize:hover,
            .codekata-btn-close:hover {
                background: rgba(51, 65, 85, 0.5);
                color: #f1f5f9;
            }

            .codekata-btn-close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #f87171;
            }

            /* Status */
            .codekata-status {
                margin-top: 8px;
                font-size: 11px;
                min-height: 16px;
                color: #64748b;
                transition: color 0.2s ease;
            }

            .codekata-status-success { color: #34d399; }
            .codekata-status-warn    { color: #fbbf24; }
            .codekata-status-error   { color: #f87171; }

            /* Reopen FAB */
            #codekata-reopen {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                width: 48px;
                height: 48px;
                border: 1px solid rgba(51, 65, 85, 0.5);
                border-radius: 50%;
                background: rgba(15, 23, 42, 0.92);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                color: #f1f5f9;
                font-size: 20px;
                cursor: pointer;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                animation: codekata-fadein 0.3s ease-out;
            }

            #codekata-reopen:hover {
                transform: scale(1.1);
                box-shadow: 0 8px 28px rgba(124, 58, 237, 0.3);
                border-color: #7c3aed;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    // ── Bootstrap ──────────────────────────────────────────────
    injectStyles();

    // Wait for DOM readiness then mount
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createPanel);
    } else {
        createPanel();
    }

    console.log(TAG, "CodeKata paste helper loaded. Use the panel or call setCode('your code') from console.");
})();

