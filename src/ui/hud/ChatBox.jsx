import {useEffect, useRef, useState} from "react";
import Icon from "../common/Icon.jsx";
import {cn} from "../lib/cn.js";
import {colorForSlot} from "../../game/data/constants.js";
import {isTyping} from "../../game/platform/keybindings.js";
import {useWindowEvent} from "../../lib/hooks/useWindowEvent.js";

// Matches the server's authoritative cap (Match.chat) so the input can never
// compose more than the relay will accept.
const MAX_LEN = 240;

const hhmm = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Multiplayer-only player chat, docked bottom-left above the HUD layout button.
// Enter opens the input and focuses it; Enter again sends and hands control
// straight back to the game (RTS convention); Escape blurs without reaching
// the global pause-menu cascade. While the input is focused, every game hotkey
// is already suppressed by the shared isTyping() guard. Collapsing to a pill
// keeps the corner clear; messages arriving collapsed show an unread badge.
//
// Placement/size/opacity/hide come from the shared AdjustablePanel wrapper in
// LiveGame (the `comms` HUD panel), so this renders relative content only — it
// no longer pins itself to a corner.
export default function ChatBox({net, mySlot, overlayOpen}) {
    const [open, setOpen] = useState(true);
    const [messages, setMessages] = useState(() => [...net.chat]);
    const [draft, setDraft] = useState("");
    const [seen, setSeen] = useState(0); // count already viewed; unread accrues only while collapsed
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const stick = useRef(true); // pinned to the newest line unless the player scrolled up

    // The net client pushes into its own rolling log; mirror it into state so
    // a message renders the instant it arrives (same wiring as _forceRender).
    useEffect(() => {
        const sync = () => setMessages([...net.chat]);
        net._onChat = sync;
        sync();
        return () => {
            if (net._onChat === sync) net._onChat = null;
        };
    }, [net]);

    useEffect(() => {
        const el = listRef.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [messages, open]);

    useEffect(() => {
        if (open) setSeen(messages.length);
    }, [open, messages.length]);
    const unread = Math.max(0, messages.length - seen);

    // Enter opens the chat from anywhere in the game — but never steals it from
    // a focused control (buttons, scoreboard rows) or an open menu overlay. The
    // map canvas holding focus still counts as "in the game".
    useWindowEvent("keydown", (e) => {
        if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
        if (overlayOpen || isTyping(e.target)) return;
        const ae = document.activeElement;
        if (ae && ae !== document.body && ae.tagName !== "CANVAS") return;
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
    });

    // Enter sends. Wired explicitly on the input (below) rather than leaning on
    // the form's implicit submission: with a single input and no submit button
    // that native path is the only trigger, and a fragile one — handling the key
    // directly guarantees the line actually goes out instead of sticking in the
    // box. The form's onSubmit stays as a belt-and-braces fallback.
    const send = () => {
        const text = draft.trim();
        setDraft("");
        if (text) net.sendChat(text);
        inputRef.current?.blur();
    };

    return (
        <div className="pointer-events-auto">
            {open ? (
                <div className="w-[300px] flex flex-col bg-panel-2 border border-line rounded shadow backdrop-blur-[8px] overflow-hidden motion-safe:animate-[dbPop_120ms_var(--ease-out)]">
                    <button type="button"
                            className="flex items-center gap-[6px] px-[10px] h-[26px] text-[9.5px] tracking-[1px] uppercase text-faint bg-panel border-b border-line hover:text-text transition-colors"
                            onClick={() => setOpen(false)}
                            title="Collapse chat" aria-expanded="true" aria-controls="db-chat-log">
                        <Icon name="message" size={12}/>
                        Comms
                        <Icon name="chevron-down" size={13} className="ml-auto"/>
                    </button>
                    <div ref={listRef} id="db-chat-log"
                         onScroll={() => {
                             const el = listRef.current;
                             if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                         }}
                         className="h-[150px] overflow-y-auto px-[10px] py-[6px] text-[12px] leading-[1.45]"
                         aria-live="polite" aria-label="Match chat">
                        {messages.length === 0 && (
                            <div className="text-faint text-[11px] pt-1">No transmissions yet.</div>
                        )}
                        {messages.map((m) => (
                            <div key={m.id} className="break-words py-px">
                                <span className="font-mono text-[9.5px] text-faint mr-[6px] tabular-nums">{hhmm(m.ts)}</span>
                                <span className="font-semibold mr-[6px]"
                                      style={{color: m.slot === mySlot ? "var(--gold)" : colorForSlot(m.slot)}}>
                                    {m.slot === mySlot ? "You" : m.username || "Commander"}
                                </span>
                                <span className="text-text">{m.text}</span>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex border-t border-line">
                        <input ref={inputRef} value={draft} maxLength={MAX_LEN}
                               onChange={(e) => setDraft(e.target.value)}
                               onKeyDown={(e) => {
                                   if (e.key === "Enter" && !e.shiftKey) {
                                       e.preventDefault();  // send here; don't defer to the form's implicit submit
                                       e.stopPropagation();
                                       send();
                                       return;
                                   }
                                   if (e.key !== "Escape") return;
                                   e.stopPropagation(); // keep the global Escape cascade (pause menu) out of it
                                   e.currentTarget.blur();
                               }}
                               placeholder="Press Enter to chat"
                               aria-label="Chat message"
                               autoComplete="off" spellCheck="false"
                               className="flex-1 min-w-0 bg-transparent px-[10px] py-[7px] text-[12px] text-text placeholder:text-faint outline-none focus:bg-sunk transition-colors"/>
                    </form>
                </div>
            ) : (
                <button type="button"
                        className={cn(
                            "relative flex items-center gap-2 h-9 px-3 rounded border border-line bg-panel text-dim backdrop-blur-[8px] transition-[color,border-color] duration-150 ease-out-db hover:text-text hover:border-blue",
                            unread > 0 && "text-text",
                        )}
                        onClick={() => setOpen(true)}
                        title="Open chat (Enter)" aria-expanded="false" aria-label="Open chat">
                    <Icon name="message" size={14}/>
                    <span className="font-display uppercase tracking-[1.5px] text-[10px] font-semibold">Comms</span>
                    {unread > 0 && (
                        <span className="min-w-[15px] h-[15px] px-1 grid place-items-center rounded-full bg-gold text-gold-contrast font-mono text-[9px] font-bold leading-none"
                              aria-label={`${unread} unread`}>{unread}</span>
                    )}
                </button>
            )}
        </div>
    );
}
