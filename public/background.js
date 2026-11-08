/**
 * PhoolGuvi — Background Service Worker
 *
 * Responsibilities:
 *   1. Open the side panel when extension icon is clicked
 *   2. Relay messages between side panel ↔ content scripts
 *   3. Track page types per tab
 */

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Track detected page types per tab
const tabPageTypes = {};

// Relay messages between side panel and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages from content scripts (have sender.tab)
  if (sender.tab) {
    if (msg.type === "PAGE_DETECTED") {
      tabPageTypes[sender.tab.id] = msg.pageType;
    }
    // Forward to side panel (side panel listens via chrome.runtime.onMessage)
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }

  // Messages from side panel (no sender.tab) — forward to active tab's content script
  if (msg.type === "COMMAND" || msg.type === "GET_STATE") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    });
    return;
  }
});

// Clean up tab tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabPageTypes[tabId];
});

