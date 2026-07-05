// Build the local simulation setup from the lobby match state. The commander is
// the local player; every other nation is AI-driven in the client-side sim.
export function liveSetup(state, myId) {
  const me = state.players.find((p) => p.player_id === myId);
  return {
    mySlot: me?.slot ?? 0,
    seed: (Number(state.match?.seed) % 2147483647) || 1,
    nations: state.players.map((p) => ({ slot: p.slot, name: p.handle, isAi: p.player_id !== myId })),
    cities: state.cities.map((c) => ({ id: c.id, slot: c.slot, name: c.name, lng: c.lng, lat: c.lat })),
  };
}
