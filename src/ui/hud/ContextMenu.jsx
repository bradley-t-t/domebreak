// Cursor-anchored right-click menu. Items: [{ label, onClick, danger, disabled, sub }].
export default function ContextMenu({x, y, title, items, onClose}) {
    return (
        <>
            <div className="gd-ctx-catcher" onClick={onClose} onContextMenu={(e) => {
                e.preventDefault();
                onClose();
            }}/>
            <div className="gd-ctx" style={{
                left: Math.min(x, window.innerWidth - 210),
                top: Math.min(y, window.innerHeight - 40 - items.length * 34)
            }}>
                {title && <div className="gd-ctx-title">{title}</div>}
                {items.map((it, i) => (
                    it.sep ? <div key={i} className="gd-ctx-sep"/> :
                        <button key={i} className={`gd-ctx-item ${it.danger ? "danger" : ""}`} disabled={it.disabled}
                                onClick={() => {
                                    it.onClick?.();
                                    onClose();
                                }}>
                            {it.label}{it.sub && <span className="gd-ctx-sub">{it.sub}</span>}
                        </button>
                ))}
            </div>
        </>
    );
}
