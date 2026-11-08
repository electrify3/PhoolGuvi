/**
 * PhoolGuvi — CodeKata Engine (MAIN world)
 *
 * Runs in the page's MAIN world on CodeKata pages to access
 * GUVI's Ace editor (window.ace). No UI — all interaction
 * happens through the React side panel via messaging.
 */
(function PhoolGuviCodeKata() {
  "use strict";

  const MSG_SOURCE = "phoolguvi-bridge";
  const TAG = "[PhoolGuvi CodeKata]";
  const POLL_INTERVAL_MS = 1500;
  const POLL_TIMEOUT_MS  = 30000;

  // ── Ace Editor Access ──────────────────────────────────
  function getAceEditor() {
    const el = document.querySelector(".ace_editor");
    if (!el || !window.ace) return null;
    try { return window.ace.edit(el); }
    catch (err) { console.warn(TAG, "Ace editor not accessible:", err); return null; }
  }

  function pasteIntoEditor(code) {
    const editor = getAceEditor();
    if (!editor) return false;
    editor.setValue(code, -1);
    editor.clearSelection();
    editor.focus();
    return true;
  }

  // Expose globally for console use
  window.setCode = function (codeString) {
    const ok = pasteIntoEditor(codeString);
    console.log(TAG, ok ? "✅ Code pasted!" : "❌ Ace editor not found.");
    return ok;
  };

  // ── Messaging ──────────────────────────────────────────
  function sendToPanel(msg) {
    window.postMessage({ source: MSG_SOURCE, direction: "to-extension", ...msg }, "*");
  }

  // Listen for commands from side panel
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== MSG_SOURCE) return;
    if (event.data.direction !== "to-page") return;

    const { type, command, value } = event.data;

    if (type === "COMMAND" && command === "PASTE_CODE") {
      const success = pasteIntoEditor(value);
      sendToPanel({
        type: "STATE_UPDATE",
        payload: {
          pasteResult: {
            success,
            message: success ? "Code injected successfully!" : "Ace editor not found on this page.",
          },
        },
      });
    }

    if (type === "GET_STATE") {
      sendToPanel({
        type: "STATE_UPDATE",
        payload: {
          editorReady: !!getAceEditor(),
          pageType: "codekata",
        },
      });
    }
  });

  // ── Editor Readiness Polling ───────────────────────────
  let editorFound = false;
  const poll = setInterval(() => {
    const ready = !!getAceEditor();
    if (ready && !editorFound) {
      editorFound = true;
      sendToPanel({ type: "STATE_UPDATE", payload: { editorReady: true } });
      console.log(TAG, "Ace editor detected.");
    }
    if (editorFound) clearInterval(poll);
  }, POLL_INTERVAL_MS);

  setTimeout(() => clearInterval(poll), POLL_TIMEOUT_MS);

  // Send initial state
  sendToPanel({
    type: "STATE_UPDATE",
    payload: {
      editorReady: !!getAceEditor(),
      pageType: "codekata",
    },
  });

  console.log(TAG, "CodeKata engine loaded. Use setCode('...') or the side panel.");
})();

