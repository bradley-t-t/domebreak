// Thin wrapper over the gd-match edge function. Direct fetch so we can read the
// JSON error body on any status.
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gd-match`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function invoke(action, payload = {}) {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const host = (matchId, p, extra) => ({ matchId, playerId: p.id, secret: p.secret, ...extra });

export const api = {
  create: (handle, maxSlots) => invoke("create", { handle, maxSlots }),
  join: (code, handle) => invoke("join", { code, handle }),
  setMaxSlots: (matchId, p, maxSlots) => invoke("setMaxSlots", host(matchId, p, { maxSlots })),
  addAi: (matchId, p, slot) => invoke("addAi", host(matchId, p, { slot })),
  removeParticipant: (matchId, p, slot) => invoke("removeParticipant", host(matchId, p, { slot })),
  replaceWithAi: (matchId, p, slot) => invoke("replaceWithAi", host(matchId, p, { slot })),
  start: (matchId, p) => invoke("start", host(matchId, p)),
  place: (matchId, p, kind, lng, lat, targetCityId) =>
    invoke("place", host(matchId, p, { kind, lng, lat, targetCityId })),
  ready: (matchId, p) => invoke("ready", host(matchId, p)),
  resolve: (matchId, p) => invoke("resolve", host(matchId, p)),
  state: (matchId, p) => invoke("state", { matchId, playerId: p?.id, secret: p?.secret }),
};
