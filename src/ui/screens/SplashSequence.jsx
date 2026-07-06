// Boot splash: TaylorURL publisher card, then the solo-developer credit.
// Skippable at any moment (click or any key) and honors reduced motion with
// instant cuts instead of fades.
import {useEffect, useRef, useState} from "react";

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

    return (
        <div className={`gd-splash ${step === 0 ? "light" : "dark"} ${reduceMotion ? "still" : ""}`}>
            {step === 0 ? (
                <div className="gd-splash-card" key="logo">
                    <img className="gd-splash-logo" src="/brand/taylorurl-logo.png" alt="TaylorURL"/>
                    <div className="gd-splash-sub">A TAYLORURL GAME</div>
                </div>
            ) : (
                <div className="gd-splash-card" key="credit">
                    <div className="gd-splash-madeby">MADE SOLO BY</div>
                    <div className="gd-splash-name">TRENTON TAYLOR</div>
                </div>
            )}
            <div className="gd-splash-skip">press any key to skip</div>
        </div>
    );
}
