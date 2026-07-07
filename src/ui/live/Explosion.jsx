// Compact fireball detonation. Every kind is FIRE — a white-hot flash, a burst
// of billowing flame blobs, a shock ring, flung embers, and a short smoke wisp.
// Kinds differ only in scale/accent (set in CSS), never hue: missiles striking
// each other read as fire, not some abstract colored puff. Pure transform/opacity
// animation so many can play at once without jank. Lifetime stays under the
// 850ms unmount timeout in LiveGame/AttractSim.

// Eight embers on an even fan (golden-angle offset) with per-spark distance and
// size variance, precomputed so the spread is lively but stable per mount.
const SPARKS = Array.from({length: 8}, (_, i) => ({
    a: Math.round(i * 137.5) % 360,
    dist: 7 + (i % 3) * 3,          // 7 / 10 / 13 px throw
    sz: 1.5 + ((i * 7) % 3) * 0.6,  // 1.5 / 2.1 / 2.7 px
    delay: (i % 4) * 12,            // slight stagger, ms
}));

export default function Explosion({kind = "hit"}) {
    return (
        <div className={`db-boom ${kind}`}>
            <span className="db-boom-flash"/>
            <span className="db-boom-ring"/>
            <span className="db-boom-fire f1"/>
            <span className="db-boom-fire f2"/>
            <span className="db-boom-fire f3"/>
            <span className="db-boom-core"/>
            <span className="db-boom-smoke"/>
            {SPARKS.map((s, i) => (
                <i key={i} className="db-boom-spark" style={{
                    "--a": `${s.a}deg`,
                    "--dist": `${s.dist}px`,
                    "--sz": `${s.sz}px`,
                    "--delay": `${s.delay}ms`,
                }}/>
            ))}
        </div>
    );
}
