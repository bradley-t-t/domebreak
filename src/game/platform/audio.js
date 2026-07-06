// Procedural audio: every sound — muted UI, launches, concussions, and the
// adaptive soundtrack — is synthesized live through the Web Audio API, so the
// game ships zero audio assets. One lazy AudioContext feeds a mastered signal
// path: two source buses (music / sfx) sum into a master gain, through a
// convolution reverb send for space and a limiter that keeps stacked sounds
// from clipping into mush. The context is created suspended-safe and unlocked
// by the first user gesture (autoplay policy); the soundtrack starts then.
//
// Aesthetic: restrained and cinematic, not arcade. Sounds are noise-forward,
// low, and heavily filtered — muffled concussions, air-raid sirens, radar
// sweeps, tactile clicks, low drones — never bright pitched beeps or melodic
// jingles. Two systems make it feel alive rather than canned:
//   • Ducking — a big detonation briefly dips the music so the impact lands.
//   • Combat heat — every violent cue raises a heat value that decays in the
//     calm; the soundtrack layers tension (sub-pulse, dissonant shimmer) in
//     proportion, so the mix breathes with the battle without the UI wiring it.

let ctx = null;
let sfxBus = null, musicBus = null, musicDuck = null, master = null, verb = null, verbReturn = null;
let vols = {music: 0.5, sfx: 0.8};
let musicTimer = null, nextChordAt = 0, nextPingAt = 0, nextBeatAt = 0, chordIdx = 0;
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
    verb.buffer = impulse(3.2, 2.6);
    verbReturn = ctx.createGain();
    verbReturn.gain.value = 0.85;
    verb.connect(verbReturn);
    verbReturn.connect(master);

    // SFX bus → master (dry) plus a send into the reverb for tail/space.
    sfxBus = ctx.createGain();
    sfxBus.gain.value = vols.sfx;
    sfxBus.connect(master);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.26;
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
    musSend.gain.value = 0.4;
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

// Enveloped noise through a (possibly sweeping) filter — the body of every boom,
// whoosh, click, and radar sweep. The workhorse now that voices lean on noise.
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

// A soft, low, slow chord swell behind a lowpass — the cinematic stinger
// primitive (win / peace) that replaces stepped arcade jingles. Detuned voices
// give it warmth without sounding like discrete notes.
function swell(freqs, {dur = 2, vol = 0.14, type = "sine", attack, cutoff = 900, at = 0, pan} = {}) {
    const t0 = ctx.currentTime + at;
    const a = attack ?? dur * 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * gainCtx, t0 + a);
    g.gain.setValueAtTime(vol * gainCtx, t0 + dur - a * 0.6);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    lp.connect(g);
    out(g, sfxBus, pan);
    freqs.forEach((fr, i) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = fr;
        o.detune.value = i % 2 ? 5 : -5;
        o.connect(lp);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
    });
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
// other; the sfx bus applies the user's master effects level on top. The design
// rule throughout: filtered noise and low tones, soft transients, no bright
// pitched melodies — muffled and physical, not chiptune.
const SFX = {
    // --- UI: muted, tactile clicks; felt more than heard --------------------
    click: () => burst(sfxBus, {dur: 0.035, vol: 0.13, filter: "lowpass", from: 1100, to: 380, q: 0.6}),
    hover: () => burst(sfxBus, {dur: 0.022, vol: 0.045, filter: "lowpass", from: 1600, to: 700, q: 0.5}),
    tab: () => {
        burst(sfxBus, {dur: 0.04, vol: 0.11, filter: "lowpass", from: 1400, to: 500, q: 0.6});
        tone(sfxBus, {type: "sine", freq: 210, dur: 0.06, vol: 0.05, attack: 0.004});
    },
    toggle: () => burst(sfxBus, {dur: 0.05, vol: 0.1, filter: "bandpass", from: 900, to: 500, q: 0.8}),
    open: () => { // a low, airy in-swell — a panel sliding into place
        burst(sfxBus, {dur: 0.28, vol: 0.09, attack: 0.08, filter: "lowpass", from: 400, to: 1200});
        tone(sfxBus, {type: "sine", freq: 160, freq2: 240, dur: 0.22, vol: 0.07, attack: 0.04});
    },
    close: () => {
        burst(sfxBus, {dur: 0.22, vol: 0.08, filter: "lowpass", from: 1200, to: 300});
        tone(sfxBus, {type: "sine", freq: 240, freq2: 130, dur: 0.18, vol: 0.06, attack: 0.02});
    },
    error: () => { // a dull, low negative thud — no buzzer
        burst(sfxBus, {dur: 0.2, vol: 0.16, filter: "lowpass", from: 420, to: 110, q: 0.7});
        tone(sfxBus, {type: "sine", freq: 150, freq2: 90, dur: 0.2, vol: 0.11, attack: 0.006});
    },
    confirm: () => { // one warm, soft mid tone — a muted acknowledgement
        tone(sfxBus, {type: "sine", freq: 330, dur: 0.14, vol: 0.12, attack: 0.008});
        burst(sfxBus, {dur: 0.05, vol: 0.06, filter: "lowpass", from: 900, to: 400});
    },
    // --- Ordnance: filtered air and low concussion, not lasers --------------
    launch: () => { // ignition thump → breathy sustained rocket → low departing rumble
        burst(sfxBus, {dur: 0.14, vol: 0.32, attack: 0.002, filter: "lowpass", from: 1400, to: 260});
        burst(sfxBus, {dur: 1.5, vol: 0.26, attack: 0.18, filter: "bandpass", from: 180, to: 720, q: 1.1});
        burst(sfxBus, {dur: 1.2, vol: 0.1, attack: 0.14, filter: "highpass", from: 700, to: 300});
        tone(sfxBus, {type: "sine", freq: 58, freq2: 90, dur: 1.3, vol: 0.16, attack: 0.12});
    },
    boom: () => { // muffled concussion: transient, detuned low body, sub, debris tail
        heatBump(0.5);
        duck(0.4, 0.1, 0.85);
        burst(sfxBus, {dur: 0.05, vol: 0.42, attack: 0.001, filter: "lowpass", from: 3200, to: 900});
        burst(sfxBus, {dur: 0.8, vol: 0.55, from: 700, to: 55});
        tone(sfxBus, {type: "sine", freq: 96, freq2: 32, dur: 0.55, vol: 0.42});
        tone(sfxBus, {type: "sine", freq: 74, freq2: 28, dur: 0.6, vol: 0.32});
        burst(sfxBus, {dur: 0.55, vol: 0.16, at: 0.09, filter: "lowpass", from: 500, to: 140, q: 0.6});
    },
    destroy: () => { // the big one: concussion, deep rolling sub, long debris rain
        heatBump(0.85);
        duck(0.55, 0.14, 1.15);
        burst(sfxBus, {dur: 0.07, vol: 0.5, attack: 0.001, filter: "lowpass", from: 3600, to: 800});
        burst(sfxBus, {dur: 1.7, vol: 0.68, from: 900, to: 34});
        tone(sfxBus, {type: "sine", freq: 82, freq2: 24, dur: 1.4, vol: 0.5});
        tone(sfxBus, {type: "sine", freq: 48, freq2: 19, dur: 1.7, vol: 0.36});
        burst(sfxBus, {dur: 1.3, vol: 0.24, at: 0.14, from: 460, to: 45, q: 0.6});
        burst(sfxBus, {dur: 1.0, vol: 0.12, at: 0.34, filter: "lowpass", from: 1400, to: 300, q: 0.5});
    },
    intercept: () => { // a filtered zip meeting a contained, muffled pop
        heatBump(0.2);
        burst(sfxBus, {dur: 0.3, vol: 0.32, filter: "bandpass", from: 1800, to: 400, q: 1.1});
        burst(sfxBus, {dur: 0.18, vol: 0.28, at: 0.05, filter: "lowpass", from: 1600, to: 300});
        tone(sfxBus, {type: "sine", freq: 150, freq2: 60, dur: 0.16, vol: 0.14, at: 0.05});
    },
    miss: () => burst(sfxBus, {dur: 0.4, vol: 0.18, from: 520, to: 70}),
    fizzle: () => burst(sfxBus, {dur: 0.32, vol: 0.14, filter: "lowpass", from: 420, to: 70, q: 0.5}),
    mirv: () => { // warhead bus separates — a few soft mechanical clunks, not beeps
        heatBump(0.35);
        for (let i = 0; i < 4; i++) burst(sfxBus, {
            dur: 0.06, vol: 0.13, at: i * 0.05, filter: "bandpass", from: 700 - i * 60, to: 200, q: 1.2
        });
        tone(sfxBus, {type: "sine", freq: 90, freq2: 50, dur: 0.2, vol: 0.1, at: 0.02});
    },
    detected: () => { // radar sweep hiss + two low warning pulses — alerting, not chiptune
        burst(sfxBus, {dur: 0.55, vol: 0.12, filter: "bandpass", from: 900, to: 2600, q: 3});
        for (let i = 0; i < 2; i++) tone(sfxBus, {
            type: "triangle", freq: 320, dur: 0.18, vol: 0.11, at: i * 0.26, attack: 0.02, freq2: 260
        });
    },
    war: () => { // slow air-raid siren wail (up then down) over a low dread swell
        heatBump(0.5);
        tone(sfxBus, {type: "sawtooth", freq: 300, freq2: 520, dur: 0.9, vol: 0.13, attack: 0.15});
        tone(sfxBus, {type: "sawtooth", freq: 520, freq2: 300, dur: 0.9, vol: 0.13, at: 0.9, attack: 0.05});
        tone(sfxBus, {type: "sine", freq: 50, freq2: 42, dur: 2.0, vol: 0.22, attack: 0.5});
    },
    peace: () => // a warm, low chord that swells and settles — release of tension
        swell([130.81, 164.81, 196.00, 261.63], {dur: 2.0, vol: 0.13, cutoff: 700}),
    research: () => { // understated: a soft airy rise and a quiet mid tone
        burst(sfxBus, {dur: 0.3, vol: 0.07, attack: 0.1, filter: "bandpass", from: 500, to: 1400, q: 1});
        tone(sfxBus, {type: "sine", freq: 300, freq2: 360, dur: 0.3, vol: 0.08, attack: 0.05});
    },
    built: () => { // a low mechanical settle — construction thunk
        burst(sfxBus, {dur: 0.12, vol: 0.16, filter: "lowpass", from: 700, to: 160});
        tone(sfxBus, {type: "sine", freq: 130, freq2: 90, dur: 0.18, vol: 0.1, attack: 0.006});
    },
    win: () => // slow, deep, resolved chord swell — cinematic, not a fanfare
        swell([98.00, 146.83, 196.00, 293.66], {dur: 2.6, vol: 0.15, cutoff: 900, attack: 1.0}),
    lose: () => { // a low drone sinking in pitch under dark noise — ominous
        tone(sfxBus, {type: "sine", freq: 140, freq2: 44, dur: 2.4, vol: 0.2, attack: 0.15});
        tone(sfxBus, {type: "sine", freq: 92, freq2: 30, dur: 2.4, vol: 0.16, attack: 0.2});
        burst(sfxBus, {dur: 2.2, vol: 0.08, filter: "lowpass", from: 300, to: 60});
    },
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

// --- Soundtrack: a slow, dark drone bed cycling minor-key pad voicings with a -
// --- widening stereo spread, a sparse radar ping, and a combat-tension layer --
// --- that fades in with `heat`. No melody — atmosphere. Scheduled a bar ahead. -
const CHORDS = [ // Am - Fmaj7 - Cm(add9)-ish - Em voicings, low register
    [110.00, 164.81, 220.00, 261.63],
    [87.31, 130.81, 174.61, 220.00],
    [98.00, 146.83, 196.00, 246.94],
    [82.41, 123.47, 164.81, 196.00],
];
const BAR = 14; // seconds per chord — slower than before, more brooding

function padChord(freqs, t0) {
    const life = BAR + 7; // overlap into the next bar for a seamless crossfade
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(220, t0);          // darker than before — muffled bed
    f.frequency.linearRampToValueAtTime(420, t0 + life / 2);
    f.frequency.linearRampToValueAtTime(200, t0 + life);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 5);
    g.gain.setValueAtTime(0.05, t0 + life - 6);
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
    sg.gain.linearRampToValueAtTime(0.12, t0 + 5);
    sg.gain.setValueAtTime(0.12, t0 + life - 6);
    sg.gain.linearRampToValueAtTime(0, t0 + life);
    sub.connect(sg).connect(musicBus);
    sub.start(t0);
    sub.stop(t0 + life);
}

function ping(t0) { // sparse, low sonar ping — the only bright thing, kept faint
    const o = ctx.createOscillator(), g = ctx.createGain(), d = ctx.createDelay(2), fb = ctx.createGain();
    const sp = ctx.createStereoPanner();
    o.type = "sine";
    o.frequency.value = 932.33;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.024, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    d.delayTime.value = 0.8;
    fb.gain.value = 0.42; // echo trail
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
    thump.frequency.setValueAtTime(74, t0);
    thump.frequency.exponentialRampToValueAtTime(38, t0 + 0.28);
    tg.gain.setValueAtTime(0, t0);
    tg.gain.linearRampToValueAtTime(0.17 * level, t0 + 0.012);
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    thump.connect(tg).connect(musicBus);
    thump.start(t0);
    thump.stop(t0 + 0.36);
    if (level > 0.55) { // high heat only: a low, dark, dissonant drone swell
        const a = ctx.createOscillator(), b = ctx.createOscillator(), sg = ctx.createGain();
        a.type = "sawtooth";
        b.type = "sawtooth";
        a.frequency.value = 233; // low register minor-second clash → dread, not shimmer
        b.frequency.value = 246.94;
        sg.gain.setValueAtTime(0, t0);
        sg.gain.linearRampToValueAtTime(0.03 * level, t0 + 0.4);
        sg.gain.linearRampToValueAtTime(0, t0 + 1.6);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1200;
        a.connect(sg);
        b.connect(sg);
        sg.connect(lp).connect(musicBus);
        a.start(t0);
        b.start(t0);
        a.stop(t0 + 1.7);
        b.stop(t0 + 1.7);
    }
}

const BEAT = 2.5; // seconds per tension beat

function startMusic() {
    if (musicTimer || !ctx) return;
    nextChordAt = ctx.currentTime + 0.1;
    nextPingAt = ctx.currentTime + 8;
    nextBeatAt = ctx.currentTime + 2.5;
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
            nextPingAt += 12 + Math.random() * 14; // sparser than before
        }
        while (nextBeatAt < ctx.currentTime + BEAT) {
            if (heat > 0.12) tension(nextBeatAt, heat); // heartbeat only while things burn
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
