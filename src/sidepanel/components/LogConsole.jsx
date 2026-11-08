import { useRef, useEffect } from "react";

export default function LogConsole({ entries = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="log-console log-empty">
        <span>No log entries yet…</span>
      </div>
    );
  }

  return (
    <div className="log-console">
      {entries.map((entry, i) => (
        <div key={i} className="log-entry">
          <span className="log-time">
            {new Date(entry.time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span className="log-text">{entry.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
