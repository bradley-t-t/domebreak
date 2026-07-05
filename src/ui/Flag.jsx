// Country flag via the flag-icons pack (SVG — emoji flags do not render on
// Windows). Keyed by ISO 3166-1 alpha-2, lowercased. Falls back to the code.
export default function Flag({ iso, className = "", style }) {
  const code = (iso || "").toLowerCase();
  if (code.length !== 2) return <span className={`gd-flag-x ${className}`} style={style}>{(iso || "—").toUpperCase()}</span>;
  return <span className={`fi fi-${code} ${className}`} style={style} />;
}
