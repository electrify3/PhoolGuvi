import LogConsole from "./LogConsole";

export default function AutoSolverPanel({ state, onCommand }) {
  const { isRunning, instantBypass, speed, lesson, status, log, courseComplete } = state;

  return (
    <div className="panel autosolver-panel">
      {/* Main Toggle */}
      <button
        className={`toggle-btn ${isRunning ? "toggle-on" : ""} ${courseComplete ? "toggle-done" : ""}`}
        onClick={() => onCommand("SET_RUNNING", !isRunning)}
      >
        <span className="toggle-indicator" />
        <span className="toggle-label">
          {courseComplete ? "Course Complete" : isRunning ? "Engine Running" : "Start Engine"}
        </span>
      </button>

      {/* Settings */}
      <div className="settings-group">
        <label className="setting-row">
          <span className="setting-label">Instant Video Bypass</span>
          <div
            className={`switch ${instantBypass ? "switch-on" : ""}`}
            onClick={() => onCommand("SET_INSTANT_BYPASS", !instantBypass)}
          >
            <div className="switch-thumb" />
          </div>
        </label>
        <label className="setting-row">
          <span className="setting-label">Playback Speed</span>
          <select
            className="speed-select"
            value={speed}
            onChange={(e) => onCommand("SET_SPEED", Number(e.target.value))}
          >
            <option value={4}>4×</option>
            <option value={8}>8×</option>
            <option value={16}>16×</option>
          </select>
        </label>
      </div>

      {/* Lesson Info */}
      {lesson && (
        <div className="info-card info-lesson">
          <span className="info-label">Lesson</span>
          <span className="info-value">{lesson}</span>
        </div>
      )}

      {/* Status */}
      <div className="info-card info-status">
        <span className="info-label">Status</span>
        <span className="info-value">{status}</span>
      </div>

      {/* Log */}
      <LogConsole entries={log} />
    </div>
  );
}
