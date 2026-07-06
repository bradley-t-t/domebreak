// Procedural audio: every sound — UI blips, launches, detonations, and the
// ambient soundtrack — is synthesized live through the Web Audio API, so the
// game ships zero audio assets. One lazy AudioContext feeds two gain buses
// (music / sfx) whose levels come from the settings panel. The context is
// created suspended-safe and unlocked by the first user gesture (autoplay
// policy); the soundtrack starts on that same gesture.

let ctx = null, sfxBus = null, musicBus = null;
let vols = {music: 0.5, sfx: 0.8};
let musicTimer = null, nextChordAt = 0, nextPingAt = 0, chordIdx = 0;
let noiseBuf = null;
const lastAt = {}; // per-sound throttle so AI missile barrages don't stack into white noise

function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxBus = ctx.createGain();
    sfxBus.gain.value = vols.sfx;
    sfxBus.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = vols.music;
    musicBus.connect(ctx.destination);
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

// One enveloped oscillator into a bus. freq may glide to freq2 over the duration.
function tone(bus, {type = "sine", freq, freq2, dur = 0.15, vol = 0.4, at = 0, attack = 0.005}) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
}

// Enveloped noise through a (possibly sweeping) filter — the body of every boom and whoosh.
function burst(bus, {dur = 0.4, vol = 0.5, at = 0, attack = 0.005, filter = "lowpass", from = 800, to = 120, q = 1}) {
    const t0 = ctx.currentTime + at;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise();
    s.loop = true;
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
}

// Each entry synthesizes one named effect. Volumes are pre-balanced against each other;
// the sfx bus applies the user's master effects level on top.
const SFX = {
    click: () => tone(sfxBus, {type: "triangle", freq: 1400, freq2: 900, dur: 0.06, vol: 0.25}),
    error: () => {
        tone(sfxBus, {type: "square", freq: 220, dur: 0.09, vol: 0.14});
        tone(sfxBus, {type: "square", freq: 165, dur: 0.14, vol: 0.14, at: 0.09});
    },
    confirm: () => {
        tone(sfxBus, {type: "triangle", freq: 740, dur: 0.07, vol: 0.2});
        tone(sfxBus, {type: "triangle", freq: 1108, dur: 0.12, vol: 0.2, at: 0.07});
    },
    launch: () => {
        burst(sfxBus, {dur: 0.9, vol: 0.3, attack: 0.12, filter: "bandpass", from: 300, to: 2400, q: 1.6});
        tone(sfxBus, {type: "sawtooth", freq: 70, freq2: 240, dur: 0.7, vol: 0.12, attack: 0.1});
    },
    boom: () => {
        burst(sfxBus, {dur: 0.7, vol: 0.55, from: 900, to: 60});
        tone(sfxBus, {type: "sine", freq: 110, freq2: 35, dur: 0.6, vol: 0.5});
    },
    destroy: () => {
        burst(sfxBus, {dur: 1.4, vol: 0.7, from: 1200, to: 40});
        tone(sfxBus, {type: "sine", freq: 90, freq2: 28, dur: 1.2, vol: 0.6});
        burst(sfxBus, {dur: 1.0, vol: 0.25, at: 0.12, from: 500, to: 50});
    },
    intercept: () => {
        burst(sfxBus, {dur: 0.35, vol: 0.4, filter: "bandpass", from: 2200, to: 500, q: 1.2});
        tone(sfxBus, {type: "square", freq: 1300, freq2: 300, dur: 0.2, vol: 0.12});
    },
    miss: () => burst(sfxBus, {dur: 0.3, vol: 0.2, from: 500, to: 100}),
    fizzle: () => burst(sfxBus, {dur: 0.25, vol: 0.15, from: 400, to: 80}),
    mirv: () => {
        for (let i = 0; i < 3; i++) tone(sfxBus, {
            type: "square", freq: 1800 - i * 350, freq2: 600, dur: 0.05, vol: 0.1, at: i * 0.05
        });
    },
    detected: () => { // missile-warning chirp: two urgent falling pulses over a radar-sweep hiss
        for (let i = 0; i < 2; i++) tone(sfxBus, {
            type: "square", freq: 980, freq2: 620, dur: 0.16, vol: 0.16, at: i * 0.22, attack: 0.01
        });
        burst(sfxBus, {dur: 0.5, vol: 0.1, filter: "highpass", from: 1400, to: 500});
    },
    war: () => { // two-tone klaxon
        for (let i = 0; i < 3; i++) {
            tone(sfxBus, {type: "sawtooth", freq: 440, dur: 0.22, vol: 0.16, at: i * 0.5, attack: 0.02});
            tone(sfxBus, {type: "sawtooth", freq: 330, dur: 0.22, vol: 0.16, at: i * 0.5 + 0.25, attack: 0.02});
        }
    },
    peace: () => {
        tone(sfxBus, {type: "sine", freq: 523, dur: 0.5, vol: 0.16, attack: 0.05});
        tone(sfxBus, {type: "sine", freq: 659, dur: 0.5, vol: 0.16, at: 0.12, attack: 0.05});
        tone(sfxBus, {type: "sine", freq: 784, dur: 0.7, vol: 0.16, at: 0.24, attack: 0.05});
    },
    research: () => {
        tone(sfxBus, {type: "sine", freq: 880, dur: 0.12, vol: 0.18});
        tone(sfxBus, {type: "sine", freq: 1318, dur: 0.3, vol: 0.18, at: 0.12});
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

// Minimum ms between repeats of the same effect — mass AI strikes stay audible, not deafening.
const GAP = {launch: 120, boom: 90, destroy: 250, intercept: 80, miss: 80, fizzle: 80, mirv: 150, detected: 600};

export function sfx(name) {
    if (!ctx || ctx.state !== "running" || !SFX[name] || vols.sfx <= 0) return;
    const now = performance.now();
    if (now - (lastAt[name] || 0) < (GAP[name] ?? 30)) return;
    lastAt[name] = now;
    SFX[name]();
}

// --- Soundtrack: a slow dark-ambient pad cycling minor-key chords, with a ---
// --- quiet sonar ping for texture. Scheduled a bar ahead on a light timer. ---
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
    f.frequency.linearRampToValueAtTime(620, t0 + life / 2);
    f.frequency.linearRampToValueAtTime(300, t0 + life);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 4);
    g.gain.setValueAtTime(0.05, t0 + life - 5);
    g.gain.linearRampToValueAtTime(0, t0 + life);
    f.connect(g).connect(musicBus);
    for (const fr of freqs) for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t0);
        o.stop(t0 + life);
    }
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

function ping(t0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), d = ctx.createDelay(2), fb = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 1174.66;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.035, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    d.delayTime.value = 0.7;
    fb.gain.value = 0.45; // echo trail
    o.connect(g);
    g.connect(musicBus);
    g.connect(d);
    d.connect(fb).connect(d);
    d.connect(musicBus);
    o.start(t0);
    o.stop(t0 + 0.6);
}

function startMusic() {
    if (musicTimer || !ctx) return;
    nextChordAt = ctx.currentTime + 0.1;
    nextPingAt = ctx.currentTime + 5;
    musicTimer = setInterval(() => {
        if (ctx.state !== "running" || vols.music <= 0) return; // muted: idle until turned back up
        while (nextChordAt < ctx.currentTime + BAR) { // keep one bar scheduled ahead
            padChord(CHORDS[chordIdx % CHORDS.length], nextChordAt);
            chordIdx++;
            nextChordAt += BAR;
        }
        if (nextPingAt < ctx.currentTime + 2) {
            ping(nextPingAt);
            nextPingAt += 6 + Math.random() * 8;
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
// context and starts the soundtrack) and the app-wide button click sound.
export function initAudio(settings) {
    applyAudioSettings(settings);
    const unlock = () => {
        const c = ensureCtx();
        if (!c) return;
        c.resume().then(() => startMusic()).catch(() => {
        });
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    // Every real <button> press clicks — one delegated listener instead of wiring each component.
    window.addEventListener("pointerdown", (e) => {
        const b = e.target?.closest?.("button");
        if (b && !b.disabled) sfx("click");
    });
}
