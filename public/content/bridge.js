/**
 * PhoolGuvi — Content Bridge (ISOLATED world)
 *
 * Runs on all guvi.in pages in the ISOLATED content script world.
 * Acts as a relay between:
 *   - chrome.runtime (can talk to background / side panel)
 *   - window.postMessage (can talk to MAIN world scripts: engine.js, codekata-engine.js)
 */
(function PhoolGuviBridge() {
  "use strict";

  const MSG_SOURCE = "phoolguvi-bridge";
  const TAG = "[PhoolGuvi Bridge]";

  // ── Detect Page Type ─────────────────────────────────────
  function detectPageType() {
    const url = window.location.href;
    if (/\/courses-video/i.test(url)) return "courses-video";
    if (/\/code-?kata/i.test(url)) return "codekata";
    return null;
  }

  const pageType = detectPageType();
  if (pageType) {
    chrome.runtime.sendMessage({ type: "PAGE_DETECTED", pageType }).catch(() => {});
  }

  // ── MAIN world → Bridge → Background / Side Panel ────────
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== MSG_SOURCE) return;
    if (event.data.direction !== "to-extension") return;

    // Strip relay metadata and forward to background
    const { source, direction, ...payload } = event.data;
    chrome.runtime.sendMessage(payload).catch(() => {});
  });

  // ── Background / Side Panel → Bridge → MAIN world ────────
  chrome.runtime.onMessage.addListener((msg) => {
    // Forward commands to MAIN world scripts via postMessage
    window.postMessage(
      { source: MSG_SOURCE, direction: "to-page", ...msg },
      "*"
    );
  });

  console.log(TAG, `Bridge active (page: ${pageType || "unknown"})`);
})();

