// Doctrine registry + selector. A doctrine is data-driven configuration for the
// budget/placement/orders layers — desired counts per unit type, patrol posture,
// and what to shed first under scrap pressure. The selector scores every
// registered doctrine against the frame and personality, takes the best as the
// PRIMARY, then stacks situational overlays (FirstStrike while prosecuting from
// strength, Space once the GDP allows) whose wants merge in at reduced weight.
// New doctrines drop in as one file plus a registry line.
import {DOCTRINE} from "../tuning.js";
import {expansionWants, wantList} from "./lib.js";
import turtle from "./turtle.js";
import balanced from "./balanced.js";
import projection from "./projection.js";
import steamroller from "./steamroller.js";
import firstStrike from "./firstStrike.js";
import space from "./space.js";

const DOCTRINES = [turtle, balanced, projection, steamroller, firstStrike, space];

export function selectDoctrines(frame, personality, posture) {
    let primary = balanced, best = -Infinity;
    for (const d of DOCTRINES) {
        const s = d.score(frame, personality, posture);
        if (s > best) { best = s; primary = d; }
    }
    const stack = [{doctrine: primary, weight: 1}];
    if (primary.id !== "firstStrike" && frame.world.atWar
        && (posture.mode === "press" || posture.mode === "blitz" || posture.mode === "decap")) {
        stack.push({doctrine: firstStrike, weight: DOCTRINE.overlayWeight});
    }
    if (primary.id !== "space" && space.score(frame, personality, posture) > 0) {
        stack.push({doctrine: space, weight: DOCTRINE.overlayWeight});
    }
    return stack;
}

// Merge the stack's wants into one list: same (kind, type) keeps the highest
// count target and the strongest weighted urgency, so an overlay deepens the
// primary's ask instead of double-buying. Doctrine-independent expansion wants
// (raise a force to annex bordering neutrals) fold in the same way, so every
// doctrine grows its territory.
export function mergedWants(stack, frame, focus, personality) {
    const byKey = new Map();
    const merge = (item, weight) => {
        const key = `${item.kind}:${item.type}`;
        const urgency = item.urgency * weight;
        const cur = byKey.get(key);
        if (!cur) byKey.set(key, {...item, urgency});
        else {
            cur.target = Math.max(cur.target, item.target);
            cur.urgency = Math.max(cur.urgency, urgency);
            cur.reserve = Math.max(cur.reserve, item.reserve);
            if (item.minNet != null) cur.minNet = Math.max(cur.minNet ?? -Infinity, item.minNet);
        }
    };
    for (const {doctrine, weight} of stack) {
        for (const item of doctrine.wants(frame, focus, personality)) merge(item, weight);
    }
    const exp = wantList(frame);
    expansionWants(exp);
    for (const item of exp.items) merge(item, 1);
    return [...byKey.values()].sort((a, b) => b.urgency - a.urgency);
}

// The primary doctrine's patrol policy and scrap bias speak for the stack.
export const patrolPolicy = (stack, frame) => stack[0].doctrine.patrols(frame);
export const scrapBias = (stack) => stack[0].doctrine.scrapBias || {};
