// Reaper test (ADR-0004 capacity leak fix): a match with no connected human
// must free its slot; one with a live socket must not.
process.env.GD_ABANDON_GRACE_S = "1"; // 1s so the test is quick
const {Match} = await import("./match.js");

const roster = [
    {userId: "u-human", username: "Trent", iso: "US", isBot: false, ready: true},
    {userId: null, username: "Vanguard", iso: "RU", isBot: true, ready: true},
    {userId: null, username: "Reaper", iso: "CN", isBot: true, ready: true},
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = true;
const assert = (c, m) => { if (!c) { pass = false; console.log("FAIL:", m); } else console.log("ok:", m); };

// Case 1: nobody ever connects -> reaped ~1s.
let finished1 = null;
const m1 = new Match({lobbyId: "L1", roster, onFinished: (m) => { finished1 = m; }});
assert(m1.reported === false, "case1: starts un-reported (holds a slot)");
await sleep(1400);
assert(m1.reported === true, "case1: reaped after abandon grace (slot freed)");
assert(finished1 === m1, "case1: onFinished fired (lobby closed, results recorded)");
assert(m1.quit.has("u-human"), "case1: absent human recorded as quit");
m1.dispose();

// Case 2: a human is connected -> NOT reaped.
let finished2 = null;
const m2 = new Match({lobbyId: "L2", roster, onFinished: (m) => { finished2 = m; }});
const fakeWs = {readyState: 1, OPEN: 1, send() {}, close() {}};
const attached = m2.attach("u-human", fakeWs);
assert(!!attached, "case2: human attaches");
await sleep(1400);
assert(m2.reported === false, "case2: NOT reaped while a human is connected");
assert(finished2 === null, "case2: onFinished not fired");

// Case 3: that human detaches -> reaped after grace.
m2.detach(attached.slot);
await sleep(1400);
assert(m2.reported === true, "case3: reaped after the last human leaves");
m2.dispose();

console.log(pass ? "\nALL PASS" : "\nFAILURES PRESENT");
process.exit(pass ? 0 : 1);
