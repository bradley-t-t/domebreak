// Shared framed-popup shell for the top-bar screens (Production, Diplomacy) —
// same centered-rectangle chrome as the research tree: header with title + close,
// scrollable body, optional footer hint. Esc closes.
import {useModal} from "../hooks/useModal.js";

export default function ScreenFrame({title, subtitle, onClose, children, foot, wide, bare, head}) {
    const ref = useModal(onClose);

    return (
        <div className="gd-screen" ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
             aria-labelledby="gd-screenframe-title">
            <div className="gd-screen-head">
                <span className="gd-screen-title" id="gd-screenframe-title">{title}</span>
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
