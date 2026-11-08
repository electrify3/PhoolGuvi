export default function Header({ pageType }) {
  const pageLabel =
    pageType === "courses-video"
      ? "Course Video"
      : pageType === "codekata"
        ? "CodeKata"
        : "No GUVI page";

  const dotColor = pageType ? "var(--success)" : "var(--text-muted)";

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">⚡</span>
        <div className="header-text">
          <span className="header-title">PhoolGuvi</span>
          <span className="header-version">v3.2</span>
        </div>
      </div>
      <div className="header-page">
        <span className="header-dot" style={{ background: dotColor }} />
        <span className="header-page-label">{pageLabel}</span>
      </div>
    </header>
  );
}
