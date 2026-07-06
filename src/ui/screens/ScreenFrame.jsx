// Shared framed-popup shell for the top-bar screens (Production, Diplomacy) —
// same centered-rectangle chrome as the research tree: header with title + close,
// scrollable body, optional footer hint. Esc closes.
import {useEffect} from "react";

export default function ScreenFrame({title, subtitle, onClose, children, foot, wide, bare, head}) {
    useEffect(() => {
        const h = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="gd-screen" role="dialog" aria-label={title}>
            <div className="gd-screen-head">
                <span className="gd-screen-title">{title}</span>
                {subtitle && <span className="gd-screen-sub">{subtitle}</span>}
                {head}
                <button className="gd-iconbtn gd-screen-close" onClick={onClose} title="Close (Esc)"
                        aria-label="Close">✕
                </button>
            </div>
            {bare
                ? <div className="gd-screen-body bare">{children}</div>
                : <div className="gd-screen-body">
                    <div className={`gd-screen-inner ${wide ? "wide" : ""}`}>{children}</div>
                </div>}
            {foot && <div className="gd-screen-foot">{foot}</div>}
        </div>
    );
}
