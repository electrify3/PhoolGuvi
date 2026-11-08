import { useState, useRef, useCallback, useEffect } from "react";

export default function CodeKataPanel({ state, onCommand }) {
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState({ text: "", type: "" });
  const textareaRef = useRef(null);

  // React to paste results from the content script
  useEffect(() => {
    if (state.pasteResult) {
      setFeedback({
        text: state.pasteResult.message,
        type: state.pasteResult.success ? "success" : "error",
      });
    }
  }, [state.pasteResult]);

  const handleInject = useCallback(() => {
    if (!code.trim()) {
      setFeedback({ text: "Paste some code first!", type: "warn" });
      return;
    }
    onCommand("PASTE_CODE", code);
    setFeedback({ text: "Injecting…", type: "" });
  }, [code, onCommand]);

  const handleClear = () => {
    setCode("");
    setFeedback({ text: "", type: "" });
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleInject();
    }
    // Tab key inserts spaces instead of moving focus
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue = code.substring(0, start) + "    " + code.substring(end);
      setCode(newValue);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  };

  return (
    <div className="panel codekata-panel">
      {/* Editor Status */}
      <div className="editor-status">
        <span className="editor-dot" data-ready={state.editorReady} />
        <span className="editor-label">
          {state.editorReady ? "Ace Editor Detected" : "Waiting for editor…"}
        </span>
      </div>

      {/* Code Input */}
      <textarea
        ref={textareaRef}
        className="code-textarea"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste your code here…"
        spellCheck="false"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />

      {/* Actions */}
      <div className="codekata-actions">
        <button className="btn btn-secondary" onClick={handleClear}>
          Clear
        </button>
        <button className="btn btn-primary" onClick={handleInject}>
          ⚡ Inject into Editor
        </button>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="shortcut-hint">
        <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to inject
      </div>

      {/* Feedback */}
      {feedback.text && (
        <div className={`feedback feedback-${feedback.type}`}>{feedback.text}</div>
      )}
    </div>
  );
}
