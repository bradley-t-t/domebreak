// Boot splash: TaylorURL publisher card, then the solo-developer credit.
// Skippable at any moment (click or any key) and honors reduced motion with
// instant cuts instead of fades.
import {useEffect, useRef, useState} from "react";
import {cn} from "../lib/cn.js";

const LOGO_MS = 2600;
const CREDIT_MS = 2300;
const REDUCED_MS = 1300;

export default function SplashSequence({reduceMotion, onDone}) {
    const [step, setStep] = useState(0); // 0 = logo card, 1 = credit card
    const done = useRef(false);
    const finish = () => {
        if (done.current) return;
        done.current = true;
        onDone();
    };

    useEffect(() => {
        const hold = reduceMotion ? REDUCED_MS : step === 0 ? LOGO_MS : CREDIT_MS;
        const t = setTimeout(() => (step === 0 ? setStep(1) : finish()), hold);
        return () => clearTimeout(t);
    }, [step, reduceMotion]);

    useEffect(() => {
        const skip = () => finish();
        window.addEventListener("keydown", skip);
        window.addEventListener("pointerdown", skip);
        return () => {
            window.removeEventListener("keydown", skip);
            window.removeEventListener("pointerdown", skip);
        };
    }, []);

    const cardCls = cn(
        "text-center motion-reduce:animate-none",
        reduceMotion ? "animate-none" : "animate-[dbSplashIn_700ms_var(--ease-out-db)_both]"
    );
    return (
        <div className={cn(
            "fixed inset-0 z-[1000] grid place-items-center cursor-pointer",
            step === 0 ? "bg-[#f4f6f8]" : "bg-[#05080f]"
        )}>
            {step === 0 ? (
                <div className={cardCls} key="logo">
                    <img className="w-[min(340px,64vw)] block mx-auto [margin:-74px_auto_-84px]" src="/brand/taylorurl-logo.png" alt="TaylorURL"/>
                    <div className="mt-0.5 font-display text-xs font-semibold tracking-[5px] text-[#6a7280]">A TAYLORURL GAME</div>
                </div>
            ) : (
                <div className={cardCls} key="credit">
                    <div className="font-display text-xs font-semibold tracking-[6px] text-dim">MADE SOLO BY</div>
                    <div className="mt-2.5 font-display text-[34px] font-bold tracking-[10px] text-text [text-shadow:var(--glow-gold)]">TRENTON TAYLOR</div>
                </div>
            )}
            <div className="absolute bottom-5 left-0 right-0 text-center font-mono text-[10px] tracking-[2px] text-[rgba(128,136,148,0.55)]"
                 role="button" tabIndex={0} aria-label="Skip intro"
                 onClick={finish}
                 onKeyDown={(e) => {
                     if (e.key === "Enter" || e.key === " ") {
                         e.preventDefault();
                         finish();
                     }
                 }}>press any key to skip</div>
        </div>
    );
}
