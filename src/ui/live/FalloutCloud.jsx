// Animated epicenter of a radioactive fallout cloud: a pulsing sickly-green glow,
// expanding contamination rings, and a trefoil core. The real damage footprint is
// the geographic haze fill in useLiveLayers; this is the living centerpiece that
// sits on top of it. `intensity` (0..1) fades the whole thing in and out in step
// with the cloud's lifecycle so it grows as the cloud ramps and dims as it decays.
export default function FalloutCloud({intensity = 1}) {
    return (
        <div className="db-fallout" style={{"--i": intensity}}>
            <span className="db-fallout-glow"/>
            <span className="db-fallout-ring"/>
            <span className="db-fallout-ring two"/>
            <span className="db-fallout-core">☢</span>
        </div>
    );
}
