// Procedural audio: every sound — UI blips, launches, detonations, and the
// adaptive soundtrack — is synthesized live through the Web Audio API, so the
// game ships zero audio assets. One lazy AudioContext feeds a mastered signal
// path: two source buses (music / sfx) sum into a master gain, through a
// convolution reverb send for space and a limiter that keeps stacked sounds
// from clipping into mush. The context is created suspended-safe and unlocked
// by the first user gesture (autoplay policy); the soundtrack starts then.
//
// Two systems make it feel alive rather than canned:
//   • Ducking — a big detonation briefly dips the music so the impact lands.
//   • Combat heat — every violent cue raises a heat value that decays in the
//     calm; the soundtrack layers tension (sub-pulse, dissonant shimmer) in
//     proportion, so the mix breathes with the battle without the UI wiring it.

let ctx = null;
let sfxBus = null, musicBus = null, musicDuck = null, master = null, verb = null, verbReturn = null;
let vols = {music: 0.5, sfx: 0.8};
let musicTimer = null, nextChordAt = 0, nextPingAt = 0, nextBeatAt = 0, chordIdx = 0, beatIdx = 0;
let noiseBuf = null;
let heat = 0;               // 0..1 combat intensity, bumped by violent cues, decays each tick
const lastAt = {};          // per-sound throttle so AI missile barrages don't stack into white noise
let panCtx = 0, gainCtx = 1; // per-call spatial context read by tone()/burst()

function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    // Master chain: buses → master → limiter → speakers. The compressor is tuned
    // as a brickwall-ish limiter so a MIRV salvo of overlapping booms stays loud
    // and punchy instead of clipping to digital hash.
    master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    // Reverb: one shared convolver with a procedural impulse response. Buses and
    // individual voices send to it; the wet return sums back at the master.
    verb = ctx.createConvolver();
    verb.buffer = impulse(2.6, 2.4);
    verbReturn = ctx.createGain();
    verbReturn.gain.value = 0.9;
    verb.connect(verbReturn);
    verbReturn.connect(master);

    // SFX bus → master (dry) plus a send into the reverb for tail/space.
    sfxBus = ctx.createGain();
    sfxBus.gain.value = vols.sfx;
    sfxBus.connect(master);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.22;
    sfxBus.connect(sfxSend);
    sfxSend.connect(verb);

    // Music bus → duck gain → master. The duck node is what detonations pull down.
    musicBus = ctx.createGain();
    musicBus.gain.value = vols.music;
    musicDuck = ctx.createGain();
    musicDuck.gain.value = 1;
    musicBus.connect(musicDuck);
    musicDuck.connect(master);
    const musSend = ctx.createGain();
    musSend.gain.value = 0.35;
    musicDuck.connect(musSend);
    musSend.connect(verb);

    return ctx;
}

// Shared 2s white-noise buffer for explosions/whooshes (cheaper than per-shot buffers).
function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
}

// Procedural reverb impulse: exponentially-decaying stereo noise. Decorrelated
// channels make the tail feel wide, not centred.
function impulse(dur, decay) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            const env = Math.pow(1 - i / len, decay);
            d[i] = (Math.random() * 2 - 1) * env;
        }
    }
    return buf;
}

// Route a voice's tail node to a bus, inserting a stereo panner when the call
// carries spatial context. Keeps every synth function pan-aware for free.
function out(node, bus, pan) {
    const p = pan ?? panCtx;
    if (p) {
        const sp = ctx.createStereoPanner();
        sp.pan.value = Math.max(-1, Math.min(1, p));
        node.connect(sp).connect(bus);
    } else {
        node.connect(bus);
    }
}

// One enveloped oscillator into a bus. freq may glide to freq2 over the duration.
function tone(bus, {type = "sine", freq, freq2, dur = 0.15, vol = 0.4, at = 0, attack = 0.005, pan}) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * gainCtx, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    out(g, bus, pan);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
}

// Enveloped noise through a (possibly sweeping) filter — the body of every boom and whoosh.
function burst(bus, {dur = 0.4, vol = 0.5, at = 0, attack = 0.005, filter = "lowpass", from = 800, to = 120, q = 1, pan}) {
    const t0 = ctx.currentTime + at;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise();
    s.loop = true;
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * gainCtx, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g);
    out(g, bus, pan);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
}

// Pull the music down hard then let it swell back — sidechain feel under impacts.
function duck(depth = 0.45, hold = 0.12, recover = 0.9) {
    if (!musicDuck) return;
    const t = ctx.currentTime;
    musicDuck.gain.cancelScheduledValues(t);
    musicDuck.gain.setValueAtTime(musicDuck.gain.value, t);
    musicDuck.gain.linearRampToValueAtTime(1 - depth, t + 0.02);
    musicDuck.gain.setValueAtTime(1 - depth, t + hold);
    musicDuck.gain.linearRampToValueAtTime(1, t + hold + recover);
}

// Each entry synthesizes one named effect. Volumes are pre-balanced against each
// other; the sfx bus applies the user's master effects level on top.
const SFX = {
    // --- UI: short, bright, unobtrusive; the texture of the interface -------
    click: () => tone(sfxBus, {type: "triangle", freq: 1400, freq2: 900, dur: 0.06, vol: 0.22}),
    hover: () => tone(sfxBus, {type: "sine", freq: 2100, dur: 0.03, vol: 0.05, attack: 0.002}),
    tab: () => {
        tone(sfxBus, {type: "triangle", freq: 900, dur: 0.04, vol: 0.12});
        tone(sfxBus, {type: "triangle", freq: 1350, dur: 0.06, vol: 0.1, at: 0.03});
    },
    toggle: () => tone(sfxBus, {type: "square", freq: 1200, freq2: 1600, dur: 0.05, vol: 0.09}),
    open: () => {
        tone(sfxBus, {type: "sine", freq: 440, freq2: 880, dur: 0.16, vol: 0.14, attack: 0.01});
        burst(sfxBus, {dur: 0.14, vol: 0.05, filter: "highpass", from: 1200, to: 3000});
    },
    close: () => tone(sfxBus, {type: "sine", freq: 760, freq2: 320, dur: 0.14, vol: 0.13, attack: 0.01}),
    error: () => {
        tone(sfxBus, {type: "square", freq: 220, dur: 0.09, vol: 0.14});
        tone(sfxBus, {type: "square", freq: 165, dur: 0.14, vol: 0.14, at: 0.09});
    },
    confirm: () => {
        tone(sfxBus, {type: "triangle", freq: 740, dur: 0.07, vol: 0.2});
        tone(sfxBus, {type: "triangle", freq: 1108, dur: 0.12, vol: 0.2, at: 0.07});
    },
    // --- Ordnance ----------------------------------------------------------
    launch: () => { // ignition crack → rising jet whoosh → low departing rumble
        tone(sfxBus, {type: "square", freq: 180, freq2: 60, dur: 0.06, vol: 0.18, attack: 0.001});
        burst(sfxBus, {dur: 1.0, vol: 0.3, attack: 0.14, filter: "bandpass", from: 300, to: 2600, q: 1.6});
        burst(sfxBus, {dur: 0.9, vol: 0.12, attack: 0.1, filter: "highpass", from: 1800, to: 900});
        tone(sfxBus, {type: "sawtooth", freq: 70, freq2: 240, dur: 0.8, vol: 0.12, attack: 0.1});
    },
    boom: () => { // transient snap, tonal body, sub thump, short debris tail
        heatBump(0.5);
        duck(0.4, 0.1, 0.8);
        burst(sfxBus, {dur: 0.05, vol: 0.5, attack: 0.001, filter: "highpass", from: 4000, to: 2000});
        burst(sfxBus, {dur: 0.7, vol: 0.55, from: 900, to: 60});
        tone(sfxBus, {type: "sine", freq: 120, freq2: 34, dur: 0.6, vol: 0.55});
        burst(sfxBus, {dur: 0.5, vol: 0.18, at: 0.08, filter: "bandpass", from: 600, to: 200, q: 0.7});
    },
    destroy: () => { // the big one: crack, deep boom, rolling sub, long debris rain
        heatBump(0.85);
        duck(0.55, 0.14, 1.1);
        burst(sfxBus, {dur: 0.06, vol: 0.6, attack: 0.001, filter: "highpass", from: 5000, to: 2400});
        burst(sfxBus, {dur: 1.5, vol: 0.7, from: 1200, to: 38});
        tone(sfxBus, {type: "sine", freq: 96, freq2: 26, dur: 1.3, vol: 0.62});
        tone(sfxBus, {type: "sine", freq: 52, freq2: 20, dur: 1.5, vol: 0.4});
        burst(sfxBus, {dur: 1.1, vol: 0.28, at: 0.12, from: 500, to: 50});
        burst(sfxBus, {dur: 0.9, vol: 0.14, at: 0.3, filter: "bandpass", from: 2200, to: 700, q: 0.8});
    },
    intercept: () => { // bright zip meeting a contained pop
        heatBump(0.2);
        burst(sfxBus, {dur: 0.35, vol: 0.4, filter: "bandpass", from: 2400, to: 500, q: 1.4});
        tone(sfxBus, {type: "square", freq: 1500, freq2: 300, dur: 0.2, vol: 0.13});
        burst(sfxBus, {dur: 0.18, vol: 0.22, at: 0.06, filter: "highpass", from: 3000, to: 1200});
    },
    miss: () => burst(sfxBus, {dur: 0.35, vol: 0.2, from: 600, to: 90}),
    fizzle: () => {
        burst(sfxBus, {dur: 0.3, vol: 0.16, from: 500, to: 80});
        tone(sfxBus, {type: "sawtooth", freq: 260, freq2: 90, dur: 0.24, vol: 0.06});
    },
    mirv: () => { // warhead bus splits — a descending flurry of metallic clicks
        heatBump(0.35);
        for (let i = 0; i < 4; i++) tone(sfxBus, {
            type: "square", freq: 1900 - i * 320, freq2: 600, dur: 0.05, vol: 0.1, at: i * 0.045
        });
    },
    detected: () => { // missile-warning chirp: urgent falling pulses over a radar-sweep hiss
        for (let i = 0; i < 2; i++) tone(sfxBus, {
            type: "square", freq: 980, freq2: 620, dur: 0.16, vol: 0.16, at: i * 0.22, attack: 0.01
        });
        burst(sfxBus, {dur: 0.5, vol: 0.1, filter: "highpass", from: 1400, to: 500});
    },
    war: () => { // rising two-tone klaxon with a low dread swell underneath
        heatBump(0.5);
        for (let i = 0; i < 3; i++) {
            tone(sfxBus, {type: "sawtooth", freq: 440, dur: 0.22, vol: 0.16, at: i * 0.5, attack: 0.02});
            tone(sfxBus, {type: "sawtooth", freq: 330, dur: 0.22, vol: 0.16, at: i * 0.5 + 0.25, attack: 0.02});
        }
        tone(sfxBus, {type: "sine", freq: 55, freq2: 44, dur: 1.6, vol: 0.22, attack: 0.4});
    },
    peace: () => { // major triad resolving up — release of tension
        tone(sfxBus, {type: "sine", freq: 523, dur: 0.5, vol: 0.16, attack: 0.05});
        tone(sfxBus, {type: "sine", freq: 659, dur: 0.5, vol: 0.16, at: 0.12, attack: 0.05});
        tone(sfxBus, {type: "sine", freq: 784, dur: 0.7, vol: 0.16, at: 0.24, attack: 0.05});
        tone(sfxBus, {type: "sine", freq: 1046, dur: 0.9, vol: 0.12, at: 0.36, attack: 0.05});
    },
    research: () => {
        tone(sfxBus, {type: "sine", freq: 880, dur: 0.12, vol: 0.18});
        tone(sfxBus, {type: "sine", freq: 1318, dur: 0.3, vol: 0.18, at: 0.12});
        tone(sfxBus, {type: "sine", freq: 1760, dur: 0.4, vol: 0.1, at: 0.24});
    },
    built: () => {
        tone(sfxBus, {type: "triangle", freq: 587, dur: 0.1, vol: 0.18});
        tone(sfxBus, {type: "triangle", freq: 880, dur: 0.2, vol: 0.18, at: 0.1});
    },
    win: () => [523, 659, 784, 1046].forEach((f, i) =>
        tone(sfxBus, {type: "triangle", freq: f, dur: 0.5, vol: 0.2, at: i * 0.18, attack: 0.02})),
    lose: () => [392, 330, 262, 196].forEach((f, i) =>
        tone(sfxBus, {type: "sawtooth", freq: f, dur: 0.7, vol: 0.14, at: i * 0.3, attack: 0.05})),
};

// Raise combat heat (clamped) — the soundtrack reads this to layer tension.
function heatBump(x) {
    heat = Math.min(1, heat + x);
}

// Minimum ms between repeats of the same effect — mass AI strikes stay audible, not deafening.
const GAP = {
    launch: 110, boom: 80, destroy: 220, intercept: 70, miss: 80, fizzle: 80,
    mirv: 140, detected: 600, hover: 40, click: 25, tab: 60
};

// Fire a named effect. `opts` may carry spatial context: pan (-1 left .. 1 right)
// and gain (0..1 distance attenuation), applied to every voice in the effect.
export function sfx(name, opts) {
    if (!ctx || ctx.state !== "running" || !SFX[name] || vols.sfx <= 0) return;
    const now = performance.now();
    if (now - (lastAt[name] || 0) < (GAP[name] ?? 30)) return;
    lastAt[name] = now;
    panCtx = opts?.pan ?? 0;
    gainCtx = opts?.gain ?? 1;
    SFX[name]();
    panCtx = 0;
    gainCtx = 1;
}

// --- Soundtrack: a slow dark-ambient pad cycling minor-key chords with a ----
// --- widening stereo spread, a quiet evolving arpeggio, a sonar ping, and a --
// --- combat-tension layer that fades in with `heat`. Scheduled a bar ahead. --
const CHORDS = [ // Am - Fmaj7 - Cm(add9)-ish - Em voicings, low register
    [110.00, 164.81, 220.00, 261.63],
    [87.31, 130.81, 174.61, 220.00],
    [98.00, 146.83, 196.00, 246.94],
    [82.41, 123.47, 164.81, 196.00],
];
const BAR = 12; // seconds per chord

function padChord(freqs, t0) {
    const life = BAR + 6; // overlap into the next bar for a seamless crossfade
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(320, t0);
    f.frequency.linearRampToValueAtTime(640, t0 + life / 2);
    f.frequency.linearRampToValueAtTime(300, t0 + life);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 4);
    g.gain.setValueAtTime(0.05, t0 + life - 5);
    g.gain.linearRampToValueAtTime(0, t0 + life);
    f.connect(g).connect(musicBus);
    // Two detuned saws per note, panned apart, for a wide analog pad.
    freqs.forEach((fr, i) => {
        [[-7, -0.35 - i * 0.05], [7, 0.35 + i * 0.05]].forEach(([det, pan]) => {
            const o = ctx.createOscillator(), sp = ctx.createStereoPanner();
            o.type = "sawtooth";
            o.frequency.value = fr;
            o.detune.value = det;
            sp.pan.value = Math.max(-1, Math.min(1, pan));
            o.connect(sp).connect(f);
            o.start(t0);
            o.stop(t0 + life);
        });
    });
    const sub = ctx.createOscillator(), sg = ctx.createGain(); // sine an octave under the root
    sub.type = "sine";
    sub.frequency.value = freqs[0] / 2;
    sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(0.12, t0 + 4);
    sg.gain.setValueAtTime(0.12, t0 + life - 5);
    sg.gain.linearRampToValueAtTime(0, t0 + life);
    sub.connect(sg).connect(musicBus);
    sub.start(t0);
    sub.stop(t0 + life);
}

// A single plucked arpeggio note high in the chord — sparse melodic texture.
function arp(freq, t0, pan) {
    const o = ctx.createOscillator(), g = ctx.createGain(), sp = ctx.createStereoPanner();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    sp.pan.value = pan;
    o.connect(g).connect(sp).connect(musicBus);
    o.start(t0);
    o.stop(t0 + 1.3);
}

function ping(t0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), d = ctx.createDelay(2), fb = ctx.createGain();
    const sp = ctx.createStereoPanner();
    o.type = "sine";
    o.frequency.value = 1174.66;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.035, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    d.delayTime.value = 0.7;
    fb.gain.value = 0.45; // echo trail
    sp.pan.value = -0.5 + Math.random();
    o.connect(g);
    g.connect(sp).connect(musicBus);
    g.connect(d);
    d.connect(fb).connect(d);
    d.connect(musicBus);
    o.start(t0);
    o.stop(t0 + 0.6);
}

// War-tension pulse: a low heartbeat thump plus a faint dissonant shimmer, both
// scaled by `heat`. Called on the beat when combat is hot so the score tightens.
function tension(t0, level) {
    const thump = ctx.createOscillator(), tg = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(80, t0);
    thump.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
    tg.gain.setValueAtTime(0, t0);
    tg.gain.linearRampToValueAtTime(0.18 * level, t0 + 0.01);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    thump.connect(tg).connect(musicBus);
    thump.start(t0);
    thump.stop(t0 + 0.35);
    if (level > 0.55) { // high heat only: a metallic minor-second shimmer up top
        const a = ctx.createOscillator(), b = ctx.createOscillator(), sg = ctx.createGain();
        a.type = "sawtooth";
        b.type = "sawtooth";
        a.frequency.value = 1568;
        b.frequency.value = 1661; // ~semitone clash → unease
        sg.gain.setValueAtTime(0, t0);
        sg.gain.linearRampToValueAtTime(0.02 * level, t0 + 0.3);
        sg.gain.linearRampToValueAtTime(0, t0 + 1.4);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3000;
        a.connect(sg);
        b.connect(sg);
        sg.connect(lp).connect(musicBus);
        a.start(t0);
        b.start(t0);
        a.stop(t0 + 1.5);
        b.stop(t0 + 1.5);
    }
}

const BEAT = 2; // seconds per tension beat / arp step

function startMusic() {
    if (musicTimer || !ctx) return;
    nextChordAt = ctx.currentTime + 0.1;
    nextPingAt = ctx.currentTime + 5;
    nextBeatAt = ctx.currentTime + 2;
    musicTimer = setInterval(() => {
        if (ctx.state !== "running") return;
        heat = Math.max(0, heat * 0.82 - 0.01); // decay combat tension toward calm
        if (vols.music <= 0) return;             // muted: idle until turned back up
        while (nextChordAt < ctx.currentTime + BAR) { // keep one bar scheduled ahead
            padChord(CHORDS[chordIdx % CHORDS.length], nextChordAt);
            chordIdx++;
            nextChordAt += BAR;
        }
        if (nextPingAt < ctx.currentTime + 2) {
            ping(nextPingAt);
            nextPingAt += 6 + Math.random() * 8;
        }
        while (nextBeatAt < ctx.currentTime + BEAT) {
            const chord = CHORDS[(chordIdx - 1 + CHORDS.length) % CHORDS.length];
            // Sparse arpeggio: one upper-octave chord tone every other beat.
            if (beatIdx % 2 === 0) {
                const n = chord[((beatIdx / 2) | 0) % chord.length] * 2;
                arp(n, nextBeatAt, beatIdx % 4 === 0 ? -0.4 : 0.4);
            }
            if (heat > 0.12) tension(nextBeatAt, heat); // heartbeat only while things burn
            beatIdx++;
            nextBeatAt += BEAT;
        }
    }, 1000);
}

export function applyAudioSettings(s) {
    vols = {music: s.musicVol ?? vols.music, sfx: s.sfxVol ?? vols.sfx};
    if (!ctx) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(vols.music, t, 0.05);
    sfxBus.gain.setTargetAtTime(vols.sfx, t, 0.05);
    // If music was muted when playback started the scheduler idled — nudge it forward.
    if (vols.music > 0 && musicTimer && nextChordAt < ctx.currentTime) nextChordAt = ctx.currentTime + 0.1;
}

// Call once at app mount. Arms the one-time unlock gesture (creates/resumes the
// context and starts the soundtrack) and the app-wide button UI sounds.
export function initAudio(settings) {
    applyAudioSettings(settings);
    const unlock = () => {
        const c = ensureCtx();
        if (!c) return;
        applyAudioSettings({musicVol: vols.music, sfxVol: vols.sfx}); // bind saved levels to the live buses
        c.resume().then(() => startMusic()).catch(() => {
        });
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    // Every real <button> press clicks; hovering a button gives a faint tick.
    // One delegated pair of listeners instead of wiring each component.
    window.addEventListener("pointerdown", (e) => {
        const b = e.target?.closest?.("button");
        if (b && !b.disabled) sfx("click");
    });
    let lastHover = null;
    window.addEventListener("pointerover", (e) => {
        const b = e.target?.closest?.("button");
        if (b && b !== lastHover && !b.disabled) sfx("hover");
        lastHover = b;
    });
}
