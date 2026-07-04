// Thin wrapper over the gd-match edge function. Direct fetch (not
// functions.invoke) so we can read the JSON error body on any status.
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

export const api = {
  create: (handle) => invoke("create", { handle }),
  join: (code, handle) => invoke("join", { code, handle }),
  start: (matchId, p) => invoke("start", { matchId, playerId: p.id, secret: p.secret }),
  place: (matchId, p, kind, lng, lat, targetCityId) =>
    invoke("place", { matchId, playerId: p.id, secret: p.secret, kind, lng, lat, targetCityId }),
  unplace: (p, placementId) => invoke("unplace", { playerId: p.id, secret: p.secret, placementId }),
  ready: (matchId, p) => invoke("ready", { matchId, playerId: p.id, secret: p.secret }),
  resolve: (matchId, p) => invoke("resolve", { matchId, playerId: p.id, secret: p.secret }),
  state: (matchId, p) => invoke("state", { matchId, playerId: p?.id, secret: p?.secret }),
};
