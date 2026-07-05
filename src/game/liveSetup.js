// Build the local simulation setup from the lobby match state. gd_cities rows
// are keyed by player_id, so we translate each city to its owner nation slot.
// The commander is the local player; every other nation is AI-driven locally.
export function liveSetup(state, myId) {
  const me = state.players.find((p) => p.player_id === myId);
  const slotByPlayer = Object.fromEntries(state.players.map((p) => [p.player_id, p.slot]));
  return {
    mySlot: me?.slot ?? 0,
    seed: (Number(state.match?.seed) % 2147483647) || 1,
    nations: state.players.map((p) => ({ slot: p.slot, name: p.handle, isAi: p.player_id !== myId })),
    cities: state.cities.map((c) => ({
      id: c.id, slot: slotByPlayer[c.player_id], name: c.name, lng: c.lng, lat: c.lat,
    })),
  };
}
