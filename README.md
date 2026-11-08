# PhoolGuvi — GUVI Auto-Solver & CodeKata Helper (v3.2)

A Chrome/Edge extension that hooks into GUVI's internal page APIs to automate course completion and provide a code paste tool for CodeKata challenges — all from a sleek React-powered side panel.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Chrome Side Panel (React)                          │
│  index.html → App.jsx                              │
│    ├─ AutoSolverPanel — toggle, settings, log       │
│    └─ CodeKataPanel — paste code, inject             │
├──────────── chrome.runtime messages ────────────────┤
│  Background Service Worker                          │
│  background.js                                      │
│    └─ Relays messages: side panel ↔ content scripts │
├──────────── chrome.tabs.sendMessage ────────────────┤
│  ISOLATED world (content script)                    │
│  content/bridge.js                                  │
│    ├─ Detects page type (courses-video / codekata)  │
│    └─ Relays: chrome.runtime ↔ window.postMessage   │
├──────────── window.postMessage ─────────────────────┤
│  MAIN world (page context)                          │
│  content/engine.js         (courses-video pages)    │
│    ├─ Wraps authorize.ajax in Promises              │
│    ├─ Completes video via API (or 16× fallback)     │
│    ├─ Solves quiz by iterating answer combos         │
│    └─ Auto-advances to the next lesson              │
│  content/codekata-engine.js  (codekata pages)       │
│    ├─ Detects Ace editor                            │
│    └─ Injects code on command                       │
└─────────────────────────────────────────────────────┘
```

## How It Works

| Step | API Call                  | What Happens                                                                 |
|------|---------------------------|------------------------------------------------------------------------------|
| 1    | `type: 'video-activity'`  | Marks the video as watched instantly — no timer wait                         |
| 2    | `type: 'get-quiz'`        | Fetches quiz questions for the current sublesson                             |
| 3    | `type: 'validate-quiz'`   | Submits answers; server responds with correct/wrong per question             |
| 4    | `CourseContent.renderCourse()` | Renders the next lesson using GUVI's own internal method              |

**Quiz strategy:** Start with option 1 for every question → server tells us which are wrong → lock correct ones, rotate wrong ones → solved in 1–3 rounds.

## Installation

1. Clone or download this repo
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Open `chrome://extensions/` (or `edge://extensions/`)
4. Enable **Developer mode**
5. Click **Load unpacked** → select the **`dist/`** folder
6. Navigate to any GUVI page → click the extension icon to open the side panel

## Development

```bash
npm run dev     # Watch mode — rebuilds on file changes
npm run build   # Production build
```

After rebuilding, click the reload button on `chrome://extensions/` to pick up changes.

## Project Structure

```
PhoolGuvi/
├── src/
│   └── sidepanel/           # React side panel UI
│       ├── index.html       # Entry point
│       ├── main.jsx         # React bootstrap
│       ├── App.jsx          # Main app (tabs, state, messaging)
│       ├── styles/
│       │   └── global.css   # Design system & all styles
│       └── components/
│           ├── Header.jsx        # Brand bar + page indicator
│           ├── TabNav.jsx        # Tab navigation
│           ├── AutoSolverPanel.jsx  # Video/quiz automation controls
│           ├── CodeKataPanel.jsx    # Code paste & inject
│           └── LogConsole.jsx       # Scrollable log display
├── public/                  # Copied to dist/ as-is by Vite
│   ├── manifest.json        # Chrome MV3 manifest
│   ├── background.js        # Service worker
│   └── content/
│       ├── bridge.js        # ISOLATED world relay
│       ├── engine.js        # MAIN world auto-solver
│       └── codekata-engine.js  # MAIN world code injector
├── dist/                    # Built output → load as extension
├── package.json
├── vite.config.js
└── README.md
```
