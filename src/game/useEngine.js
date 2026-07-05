import { useEffect, useMemo, useReducer, useRef } from "react";
import { createWorld, step, buyPlace, commandAttack, commandResearch, declareWar, makePeace } from "./engine.js";

// Drives the real-time loop. The world is mutated in place every animation frame;
// the component re-renders on a throttled tick so React work stays ~15fps while
// projectiles still integrate smoothly per frame.
export function useEngine(setup) {
  const ref = useRef(null);
  if (!ref.current) ref.current = createWorld(setup);
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    let raf, last = performance.now(), acc = 0;
    const loop = (now) => {
      const w = ref.current;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (w && !w.paused && !w.over) step(w, dt * w.speed);
      acc += dt;
      if (acc >= 0.06) { acc = 0; force(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const api = useMemo(() => ({
    setSpeed: (m) => { ref.current.speed = m; ref.current.paused = false; force(); },
    pause: () => { ref.current.paused = true; force(); },
    play: () => { ref.current.paused = false; force(); },
    buyPlace: (type, lng, lat) => { const r = buyPlace(ref.current, ref.current.mySlot, type, lng, lat); force(); return r; },
    commandAttack: (uid, tid) => { const r = commandAttack(ref.current, uid, tid); force(); return r; },
    research: (id) => { const r = commandResearch(ref.current, ref.current.mySlot, id); force(); return r; },
    declareWar: (slot) => { declareWar(ref.current, ref.current.mySlot, slot); force(); },
    makePeace: (slot) => { makePeace(ref.current, ref.current.mySlot, slot); force(); },
  }), []);

  return [ref.current, api];
}
