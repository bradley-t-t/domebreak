<h1 align="center">Framework Compliance Audit</h1>

<p align="center">
  <b>Multi-agent audit of src/ against the .claude/ guidelines — 45 confirmed findings, 29 fixed in the same session, 26 left open, every fix verified behavior-preserving.</b>
</p>

<br />

**Date**: 2026-07-05

Multi-agent audit of src/ against .claude/ guidelines (adapted per CLAUDE.md). 70 agents: 8 dimension auditors +
adversarial verification of every finding. 45 confirmed + 10 downgraded findings; 7 claims refuted and dropped.

**29 findings fixed in the same session** (data-driven extraction to constants.js: ECONOMY, AI_TUNING,
CITY_HP/CAPITAL_HP, INTERCEPT_CAP, SCRAP_REFUND_FRAC, COAST_KM, patrol orbits, defaults; UI formula dedup; dead code
removal; doc comments; doc pointer repairs). Verified behavior-preserving: headless engine regression + lint + build
green.

## Open findings (26)

### [BLOCKING][ui-state] src/ui/live/LiveGame.jsx:463

Placement/relocation legality is decided entirely inside the component (placeError/inMyLand/nearWater built on map
queryRenderedFeatures), and the engine's own territory check is then bypassed by passing territoryOk=true to
api.buyPlace (line 463) and api.move (line 456) — the engine (production.js queueUnit/moveUnit) has no
land/water/coastal rules at all, so game legality is owned by the rendering layer.

**Fix:** Add an engine-side query, e.g. placementError(w, slot, type, lng, lat) in src/game/sim/queries.js, built on the
already-exported data-backed isSea(lng, lat) from src/game/geo/seaRoute.js plus inTerritory(); have queueUnit/moveUnit
call it unconditionally, drop the territoryOk escape hatch, and let LiveGame call the same query for the hover preview
and just display the returned error.

### [BLOCKING][coverage-gaps] package.json:8

No test infrastructure exists at all — tests/ directory is absent, no test runner (vitest/jest) is in dependencies, and
package.json has no "test" script, so the framework's BLOCKING Logic-story gate (automated unit test must pass) is
unenforceable for every system in the game.

**Fix:** Run /test-setup: add vitest as a devDependency, add "test": "vitest run" to scripts, create tests/unit/, and
seed the first suites against the pure-function sim modules (src/game/sim/queries.js, src/game/sim/combat.js,
src/game/geo/seaRoute.js), which are already dependency-injected via the world-state parameter and need no mocking.

### [MAJOR][hot-path] src/game/sim/tick.js:294

The interception check computes defenseRange(w, d) for every candidate (projectile, defense) pair every tick, and
defenseRange -> radarLinked (queries.js:83) scans ALL w.units with haversine per call, making the projectile loop
worst-case O(projectiles x defenses x units) trig work at 60 Hz.

**Fix:** At the top of the projectile section of step(), build once per tick a per-slot list of live, airborne defenses
with their effective range precomputed (evaluate radarLinked once per defense, not per pair), then for each projectile
iterate only defensesBySlot[inboundSlot]. This drops the pair loop to O(projectiles x defenses-of-target-slot) with O(1)
range lookups.

### [MAJOR][hot-path] src/game/sim/tick.js:244

The <=80ms flight sub-step loop calls flyAircraft up to ~13x per tick at high game speed, and every sub-step re-runs O(
units) scans inside flyAircraft: the base lookup w.units.find (aircraft.js:184), the base.op liveness w.units.some (
aircraft.js:191), and in hold phase a full w.units.filter pattern count (aircraft.js:244).

**Fix:** Resolve the base object (and the base's in-pattern aircraft count) once per tick before the while(rem) loop in
tick.js and pass them into flyAircraft as parameters; nothing in the sub-step loop can invalidate them mid-tick.

### [MAJOR][hot-path] src/game/sim/tick.js:188

netIncomeOf is recomputed per nation every tick — incomeOf, upkeepOf, and industryOutputOf (queries.js:14-58) each scan
all cities and all units, i.e. O(nations x (cities + units)) at 60 Hz — and it is recomputed again per engaging defense
at tick.js:296, even though the value only changes when a unit or city is built or destroyed.

**Fix:** Compute per-slot income/upkeep aggregates in a single O(cities + units) pass at the top of step() (one table
keyed by slot), reuse it for the income accrual, the interceptor upkeep gate (tick.js:296), and aiTick; or cache
per-nation net income with a dirty flag set on build/destroy.

### [MAJOR][network-security] supabase/functions/db-account/index.ts:38

report_match verifies only the caller's identity, never that a match actually happened — any signed-in client can POST
unlimited fabricated {result:"win"} reports from dev tools with no rate limit and no dedup, so ADR-0001's stated
consequence "Stats cannot be forged by any client-side manipulation" does not hold (the exact forgery the ADR cites when
rejecting Alternative 1 is still possible through this function).

**Fix:** Short term: add a per-user throttle (count recent matches rows before insert, reject over a cap) and a
client-supplied idempotency key with a unique index so retries and spam dedup; long term: mint a server-side match token
at game start and require it in report_match; amend ADR-0001's Consequences/Risks to document the residual
self-reporting trust gap.

### [MAJOR][network-security] supabase/functions/db-account/index.ts:43

report_match does type checks but no range/size validation: startedAt accepts any string (a non-ISO value makes the
Postgres insert fail 500 on both fire-and-forget attempts, and arbitrary past/future timestamps are stored), opponents
accepts negative/fractional/huge numbers (fractions 500 against the int column), durationS has no upper bound (one
report can add 1e300 seconds to total_playtime_s), and stats accepts an arbitrarily large jsonb blob — violating the
network rule "validate all incoming packet sizes and field ranges".

**Fix:** Null out startedAt unless Number.isFinite(Date.parse(m.startedAt)); coerce opponents with Math.trunc and clamp
to [0, 63]; clamp durationS to [0, a sane ceiling such as 30 days]; store {} when JSON.stringify(m.stats).length
exceeds ~8 KB; mirror the ranges as check constraints in the migration as a backstop.

### [MAJOR][network-security] supabase/functions/db-match/index.ts:298

The create and join actions are fully unauthenticated with no rate limiting, letting anyone who finds the function URL
insert unbounded db_players/db_matches/db_match_players/db_cities rows (5+ rows per create call), and since the
multiplayer client (src/lib/api.js, Lobby/Home) was deleted this deployed function is now pure attack surface in the
same Supabase project that hosts the accounts schema — quota exhaustion here degrades auth and stats for everyone.

**Fix:** Undeploy or disable db-match until the multiplayer client returns; if it must stay live, gate create/join
behind the same verified-JWT check db-account uses and add per-IP/per-user rate limiting.

### [MAJOR][network-security] supabase/functions/db-match/index.ts:413

Budget enforcement in the place action is a read-check-write race (TOCTOU): two concurrent place requests both read the
same mp.spent, both pass the budget check, and both insert placements before either updates spent, so a client can
exceed its build budget — the server is not actually authoritative over spending as the network rules require.

**Fix:** Make the spend atomic: a Postgres function/RPC that inserts the placement and increments spent in one statement
guarded by "where spent + cost <= budget" (gating the insert on the update's row count), plus a check constraint (
spent <= budget) as a backstop.

### [MAJOR][coverage-gaps] design/CLAUDE.md:20

design/gdd/systems-index.md does not exist even though design/CLAUDE.md mandates a systems index updated with every GDD,
so there is no map of the 12 implemented systems, their design order, or which have docs.

**Fix:** Run /map-systems to generate design/gdd/systems-index.md from the sim inventory (combat, economy, production,
warheads, aircraft, sensors, sea-routing, diplomacy, research, AI, saves, accounts), marking sensors and accounts as
documented and the other 10 as backfill targets.

### [MAJOR][coverage-gaps] docs/architecture/tr-registry.yaml:30

The TR-ID registry is empty (requirements: [ ]) despite two completed GDDs, so no technical requirement from
sensors-and-fog-of-war.md or accounts-and-stats.md has a stable ID — /create-stories and /story-readiness cannot trace
stories to requirements.

**Fix:** Run /architecture-review to extract technical requirements from the two existing GDDs and append
TR-sensors-NNN / TR-accounts-NNN entries to the registry before any story work references them.

### [MINOR][engine-purity] src/game/geo/geo.js:57

occludedByGlobe(map, lng, lat) takes a MapLibre map instance and reads map.transform.isLocationOccluded —
rendering/camera logic living in the engine's geo module, used only by UI (SkyLayer.jsx:2, CountryLabels.jsx:2).

**Fix:** Move occludedByGlobe to src/map/ (e.g. src/map/occlusion.js) and update the two UI imports; geo.js then
contains only pure geodesic math.

### [MINOR][hot-path] src/game/sim/combat.js:56

launch() calls sensedBy -> sensorsOf for every other nation on every launch, rebuilding each nation's full sensor list (
O(nations x units)) from scratch; a mass salvo tick rebuilds identical sensor lists dozens of times.

**Fix:** Cache sensors-by-slot once per step() on the world (the 4 Hz sweep at tick.js:330 already builds exactly this
table — hoist it so launch() and the sweep share one per-tick/per-sweep cache instead of recomputing per launch).

### [MINOR][ai-rules] .claude/rules/ai-code.md:3

The AI code rules are path-scoped to `src/ai/**`, a directory that does not exist in this repo — the actual AI lives in
src/game/sim/tick.js, so the AI rules never activate when the AI code is edited.

**Fix:** Change the frontmatter paths to cover the real AI location, e.g. `src/game/sim/**` (or at minimum
`src/game/sim/tick.js`), and note in the file that aiTick is the AI entry point.

### [MINOR][network-security] supabase/functions/db-match/index.ts:469

The state action returns every participant's spent, budget, and ready flags plus full city state to any caller who
merely knows the matchId, with no credentials — leaking opponents' build-phase spending (strategic information) to other
players and to unauthenticated spectators.

**Fix:** Return only the caller's own spent/budget (require playerId/secret for those fields) and strip per-player
economy fields from unauthenticated responses until the match status is done.

### [MINOR][network-security] supabase/functions/db-match/index.ts:166

If the invocation that wins the build->combat compare-and-swap crashes or hits the edge-function time limit
mid-resolve (the function awaits one UPDATE per city in a loop plus several sequential queries), the match is wedged in
status "combat" with no db_results row and every subsequent resolve call returns {pending:true} forever — no
reconnection/recovery path as the network rules require.

**Fix:** Make resolution idempotent and add a recovery path: permit re-running resolve when status="combat" and no
db_results row exists after a grace period, and batch the per-city HP writes into a single upsert to shrink the crash
window.

### [MINOR][network-security] src/account/api.js:36

fetchStats and fetchProfile discard the Supabase error object entirely, so any read failure (offline, expired token,
RLS/schema regression) silently renders as a zeroed "0 matches" stats block or a missing profile instead of an error or
stale-data state — failures are masked rather than handled gracefully.

**Fix:** Return {data, error} from both helpers; in App.jsx keep the previously loaded stats when error is set and
surface a lightweight "stats unavailable" indicator instead of substituting the zeroed shape.

### [MINOR][coverage-gaps] design/gdd/sensors-and-fog-of-war.md:73

The Tuning Knobs section lists only current values (OTH cost 500, range 5000, upkeep 2.5) without the safe ranges and
affected-gameplay-aspect statements required by .claude/rules/design-docs.md line 13, unlike accounts-and-stats.md which
has a compliant Range/Rationale table.

**Fix:** Convert the Tuning Knobs paragraph to the same table format as accounts-and-stats.md, adding a safe range and
gameplay effect per knob (e.g. OTH range 4000-6000 km — controls how many enemy silos one array covers and thus
boost-phase warning frequency).

### [MINOR][engine-purity] src/game/sim/newGame.js:10

loadGameData() calls the browser fetch() API (plus a module-level mutable cache) inside src/game/sim/**, violating the
rule that browser/IO APIs live only in src/game/platform/**.

**Fix:** Move loadGameData and its _data cache to a new src/game/platform/gameData.js adapter; keep sim/newGame.js as
pure functions (buildSetup) that receive the already-loaded {cities, countries} data, and update the two importers (
src/App.jsx:10, src/ui/live/AttractSim.jsx:12).

### [MINOR][ui-state] src/App.jsx:167

App.jsx handlers mutate the world object directly instead of going through the engine API: pause() sets world.paused =
true (line 167), resume() sets world.paused = false (line 171), onStart writes w.speed/w.paused/w.meta (lines 136-138),
and onLoadSlot writes w.paused = false (line 145).

**Fix:** Export small command functions from src/game/engine.js — e.g. setPaused(w, on), setGameSpeed(w, m) — and have
both App.jsx and useEngine's api.pause/play/setSpeed call them; move the w.meta initialization into
createWorld/buildSetup (pass playerIso/playerName/belligerents in the setup object) so no component ever assigns world
fields.

### [MINOR][hot-path] src/ui/live/useLiveLayers.js:52

defenseFC calls defenseRange(w, u) for every visible defense unit on every React render (~30 fps), and each call runs
radarLinked's haversine scan over ALL w.units — an O(defenses x units) trig loop per frame inside a render-path useMemo.

**Fix:** Compute effective defense ranges once per pass into a Map (single loop that groups radar sources first, then
evaluates each defense), or have the engine stamp the radar-linked range on the unit during its own tick so the UI just
reads a field; alternatively throttle this layer to a coarse cadence like the engine's 4 Hz sensor sweep.

### [MINOR][hot-path] src/ui/live/useLiveLayers.js:37

mySensors (full sensorsOf scan) and the visUnits fog filter (sensorsCover = O(sensors) haversine per unit) recompute on
every ~30 fps render because their deps include w.time, costing O(units x sensors) haversine per frame for a sensor
picture the engine itself only refreshes at 4 Hz (tick.js:327).

**Fix:** Reuse the engine's sensor cadence: keep the last computed mySensors/visUnits in a ref and only recompute when a
low-rate counter changes (e.g. have step() bump w.sensorTick each 0.25 s sweep and depend on that instead of w.time).

### [MINOR][hot-path] src/ui/live/SkyLayer.jsx:61

Every render (30 fps engine force plus every map 'move' event) resamples each projectile's entire trail from scratch —
23 screenAt calls, each running trackPoint (two trig-heavy interpGC calls) plus projection/occlusion — and recreates 22
SVG <line> React elements per trail, though the geo ground-track samples at fractions below p.progress never change; at
hundreds of projectiles this is ~14k interpGC calls and thousands of recreated elements per frame.

**Fix:** Cache geo-space trail samples per projectile id (append new samples as p.progress advances, keyed off the
shared trackPoint), so each frame only re-projects cached lng/lat points to screen; render each trail as a
single <polyline>/<path> with an opacity gradient instead of 22 individual <line> elements.

### [MINOR][ai-rules] src/game/sim/tick.js:132

Inside aiTick's per-nation loop, every successful queue action uses `return` (lines 132, 139, 146, 149, 154, 159, 165,
171), which aborts the entire function — all AI nations after the acting one in w.nations order skip their turn AND
their `_ai` timer decrement that tick, systematically biasing multi-AI games toward earlier-slot nations.

**Fix:** Extract the per-nation body into a helper (e.g. `aiNation(w, n)`) whose internal `return`s end only that
nation's turn, and have aiTick call it per nation — or restructure so a queue action breaks to the next loop iteration
instead of returning.

### [MINOR][ai-rules] src/game/sim/tick.js:96

The AI is not debuggable: aiTick records no decision reason, emits no log, and has no debug gate anywhere in
src/game/sim/, so there is no way to inspect why the AI bought, targeted, or skipped anything (rule: 'AI must be
debuggable' / 'log transitions for debugging').

**Fix:** Add a cheap gated trace — e.g. store the last N decisions on the nation (`n._aiLog = [{t, action, why}]`,
capped) or push a debug-only event when `w.debugAi` is set — covering target assignment, each queue decision, and
deficit-gate skips.

### [MINOR][network-security] src/App.jsx:141

Loading a save routes through enterGame, which resets wallStartedAtRef and reportedRef and later reports durationS as
cumulative world.time, so one campaign played across N save/load sessions produces N matches rows each carrying the full
accumulated duration — e.g. quit at 2h then load and win at 3h records 2 matches and 5h of playtime, violating
ADR-0001's "exactly one matches row per terminal match event" and silently inflating total_matches/total_playtime_s.

**Fix:** Persist a stable match UUID, the original startedAt, and the reported flag in the save metadata (
doSave/loadGame); report durationS as the delta since the last report and dedup server-side on the match UUID (unique
index) so a resumed game updates rather than re-inserts.

## Systemic patterns (21)

### [MAJOR][data-driven] The entire opponent AI in aiTick() is tuned with inline magic numbers: decision cadence 3 + rand

*3, thermo-arm chance 0.25 (twice), production queue cap 2, warhead stock targets (<4 standard, <1 thermo) with point
buffers +60/+300, structure-purchase buffers +100/+150/+120, industry target <3, research trigger at 350 points with
0.55 probability, silo trigger at cost+200 with net>3, and the per-slot startup stagger 2 +
slot*0.3 in createWorld. None of it is reachable from constants.js, so AI difficulty cannot be tuned (or
difficulty-scaled) without editing tick logic.

Examples: src/game/sim/tick.js:101, src/game/sim/tick.js:117, src/game/sim/tick.js:126, src/game/sim/tick.js:145-177,
src/game/engine.js:18

**Recommendation:** Create a single exported AI_TUNING object in src/game/data/constants.js ({ decisionMin,
decisionJitter, maxQueue, thermoChance, stdStockTarget, reserveBuffers: {...}, researchMinPoints, researchChance,
siloBuffer, siloMinNet, startStagger }) and have aiTick()/createWorld() read exclusively from it. This also unlocks
future difficulty presets for free.

### [MAJOR][data-driven] Sim gameplay values are restated verbatim in UI components instead of being imported: the 0.97 intercept cap, the 0.55 airborne threshold, the 50% scrap refund label, and the buildTime||10 fallback all exist twice (once in src/game/sim, once in src/ui). Any rebalance in the sim silently desynchronizes the UI display.

Examples: src/ui/live/LiveGame.jsx:94, src/ui/live/useLiveLayers.js:42, src/ui/live/LiveGame.jsx:594,
src/ui/hud/ProductionBar.jsx:14

**Recommendation:** Once the values are lifted into src/game/data/constants.js (per the individual findings), UI code
must import them through the engine facade (src/game/engine.js) or call the existing query helpers (airborne(), a new
effectiveIntercept()) — never retype a sim number in a component.

### [MINOR][data-driven] Missing-stat fallback defaults are hardcoded inline at use sites: buildTime || 10 (tick.js:212), reload || 3 (tick.js:298), hitProb ?? 0.8 (tick.js:359), gdp || 0.5 (newGame.js:34). Each is a gameplay value that only fires when data is incomplete, and each lives in a different file with no shared source of truth.

Examples: src/game/sim/tick.js:212, src/game/sim/tick.js:298, src/game/sim/tick.js:359, src/game/sim/newGame.js:34

**Recommendation:** Either declare the defaults in constants.js (DEFAULT_BUILD_TIME, DEFAULT_RELOAD, DEFAULT_HIT_PROB,
DEFAULT_GDP_T) or, better, validate UNITS/WARHEADS completeness at module load so the fallbacks become unreachable and
can be deleted.

### [MINOR][engine-purity] UI bypasses the engine.js facade and imports engine internals (sim/, data/, geo/) directly, eroding the 'stable public surface' contract that lets sim modules be refactored without touching UI.

Examples: src/ui/screens/NewGame.jsx:3 (GREAT_POWERS from game/sim/newGame.js), src/ui/live/AttractSim.jsx:12 (
buildSetup from game/sim/newGame.js), src/ui/panels/UnitsPanel.jsx:16 and src/ui/hud/AmmoBar.jsx:1 (WARHEAD_ICON etc.
from game/data/constants.js), src/ui/live/SkyLayer.jsx:2 and src/ui/live/useLiveLayers.js:8 (
occludedByGlobe/circle/gcTrail from game/geo/geo.js), src/ui/hud/LiveHud.jsx:2 and src/ui/live/LiveGame.jsx:34 (
GAME_SPEEDS/SLOT_COLOR from game/data/constants.js)

**Recommendation:** Either re-export the handful of missing symbols (buildSetup, GREAT_POWERS, GAME_SPEEDS, SLOT_COLOR,
WARHEAD_ICON, circle, gcTrail) from engine.js and lint-ban deep imports of game/sim/** from ui/**, or explicitly
document game/data/** and game/geo/** as public surface in src/CLAUDE.md so only sim/** is private.

### [MINOR][engine-purity] Presentation-only data (icon names, map colors, glyphs, emoji helpers, globe-occlusion) is interleaved with gameplay tuning inside the engine layer, blurring the engine/render boundary even where imports stay legal.

Examples: src/game/data/constants.js:12 (SLOT_COLOR map colors), src/game/data/constants.js:391 (UNIT_ICON asset names),
src/game/data/constants.js:416 (WARHEAD_ICON asset names), src/game/sim/newGame.js:20 (isoFlag emoji helper),
src/game/geo/geo.js:57 (occludedByGlobe MapLibre coupling)

**Recommendation:** Split a src/ui/common/presentation.js (or src/map/theme.js) module for icons/colors/flags and move
occludedByGlobe to src/map/, leaving src/game/data/constants.js purely gameplay tuning — this also makes the 'no
gameplay values outside data/' audit mechanically greppable.

### [MAJOR][ui-state] Research-effective stat formulas (base stat × nation multiplier) are recomputed inline in UI code instead of queried from the engine: damage × dmgMult, range × rangeMult, reload × reloadMult, radarRangeOf × radarMult each mirror a line of sim code (combat.js:64, tick.js:255, tick.js:261, queries.js:91/102) and will silently drift the moment any of those formulas changes.

Examples: src/ui/live/LiveGame.jsx:94, src/ui/live/LiveGame.jsx:101-103, src/ui/live/LiveGame.jsx:108-110,
src/ui/live/useLiveLayers.js:44, src/ui/live/useLiveLayers.js:75-88

**Recommendation:** Add effective-stat queries to src/game/sim/queries.js (effDamage(w,u), effStrikeRange(w,u),
effReload(w,u), effRadarRange(w,u) — defenseRange already exists as the model), re-export them through engine.js, and
replace every inline multiplication in src/ui with the query. The sim should use the same functions so there is exactly
one copy of each formula.

### [MAJOR][ui-state] Cost display and affordability pre-checks are duplicated across panels using raw UNITS/WARHEADS/TECHS numbers rather than an engine query — the drift is already real for units/aircraft because the engine charges cost × buildCostMult (production.js:75, 217) while every UI surface shows and gates on the raw cost.

Examples: src/ui/panels/UnitsPanel.jsx:48, src/ui/panels/UnitsPanel.jsx:62, src/ui/live/SelectionPanel.jsx:53-59,
src/ui/live/LiveGame.jsx:584, src/ui/panels/ResearchPanel.jsx:39

**Recommendation:** Introduce a single pricing/affordability surface in the engine (e.g. costOf(w, slot, {kind, type})
and canAfford(w, slot, order)) and use it for every price label, disabled state, and 'poor' style. Components should
never compare n.points against a constants value themselves — the engine result is the only truth, and the ◆ labels then
automatically reflect cost-reduction techs.

### [MAJOR][doc-comments] Mutating order/command functions across the sim share an implicit {ok:true,...}|{error:string} result convention that is documented nowhere, so the contract (and its point-cost/refund side effects) must be reverse-engineered at every call site.

Examples: src/game/sim/production.js:19 (declareWar), src/game/sim/production.js:141 (scrapUnit, half-cost refund),
src/game/sim/production.js:184 (unqueueResearch, refund + dependency gate), src/game/sim/production.js:82 (moveUnit,
returns {ok,cost})

**Recommendation:** Document the result shape once in a module-level comment in production.js (the order API home), then
give each command a one-line doc stating validation, cost/refund, and mutation. Cheap to do and it fixes the bulk of the
repo's undocumented-public-API surface in one file.

### [MINOR][doc-comments] Files lean on a one-line module header as the only documentation while individual exports carry nothing — acceptable for 2-3 obvious exports, but it leaves non-obvious units, return contracts, and side effects undocumented in larger files.

Examples: src/game/sim/queries.js (10 undocumented exports under one header), src/game/platform/saves.js (6 exports,
header only), src/game/geo/seaRoute.js:21 (isSea — 0.25-degree rasterized approximation unstated),
src/game/platform/localData.js:35 (removeKey), src/game/sim/newGame.js:7 (loadGameData)

**Recommendation:** Adopt the convention that every exported symbol gets at least one // line unless an immediately
adjacent group comment covers it, and enforce it with eslint-plugin-jsdoc (require jsdoc/require-jsdoc or a lightweight
custom rule) scoped to src/game/** exports, matching the coding standard 'all game code must include doc comments on
public APIs'.

### [MINOR][doc-comments] findTarget is duplicated verbatim — code AND doc comment — in two modules; all importers (production.js, tick.js) use the combat.js copy, so the queries.js export is dead duplication whose comment will silently drift from the live one.

Examples: src/game/sim/queries.js:131, src/game/sim/combat.js:11

**Recommendation:** Keep one canonical findTarget (combat.js's header already claims it; alternatively queries.js as the
read-only home and import it into combat.js), delete the unused duplicate, and make its doc comment the single source of
truth for the {kind, ref, slot, alive, lng, lat} target shape.

### [MAJOR][hot-path] Linear id lookups in the per-tick path: findTarget scans w.cities then w.units on every call and is invoked per offense unit (tick.js:249), per projectile per tick (tick.js:286), and per projectile per sensor sweep (tick.js:334); each interceptor re-finds its target via w.projectiles.find (tick.js:347). At hundreds of projectiles/interceptors this is O(n^2) entity scanning every tick for lookups that should be O(1).

Examples: src/game/sim/combat.js:11 (findTarget: sequential w.cities.find + w.units.find), src/game/sim/tick.js:286 (
findTarget per projectile per tick), src/game/sim/tick.js:334 (findTarget per projectile per 4 Hz sweep),
src/game/sim/tick.js:347 (w.projectiles.find per interceptor per tick)

**Recommendation:** Build Map indexes (id -> city, id -> unit, id -> projectile) once at the top of step() and thread
them through the tick helpers (or maintain persistent maps updated on spawn/prune). findTarget keeps its public
signature for UI/order callers but accepts an optional index for the hot path.

### [MAJOR][hot-path] All useLiveLayers memos (and inline SkyLayer prop filters in LiveGame) include w.time — which changes every tick — in their deps, so every GeoJSON FeatureCollection (all cities, 44-point radar circles per sensor, pop weights, command/sail lines) plus the projectile/interceptor fog filters is fully rebuilt at ~30 fps, even though most of these only change on discrete events (build, destroy, war, ship orders).

Examples: src/ui/live/useLiveLayers.js:31 (liveFC re-maps every city per frame), src/ui/live/useLiveLayers.js:48 (
radarFC rebuilds a 44-point circle per sensor per frame), src/ui/live/useLiveLayers.js:64 (popFC re-maps cities +
backdrop per frame), src/ui/live/useLiveLayers.js:111 (cmdLines: gcTrail great-circle sampling per targeting unit per
frame), src/ui/live/LiveGame.jsx:755 (unmemoized projectile/interceptor fog filters with sensorsCover haversine per
interceptor per render)

**Recommendation:** Split layers by change rate: key slow-changing layers (cities, pop, radar rings) on a coarse version
counter the engine bumps on built/destroy/war events (or a 4 Hz counter), keeping only genuinely per-frame layers (sky
trails, moving ships/aircraft) on the fast path; memoize the LiveGame SkyLayer prop filters with the same throttled
sensor picture.

### [MINOR][hot-path] Aircraft-by-base membership is recomputed via full w.units scans repeatedly per tick: runAirbase does four separate scans per airbase per tick (op liveness, fighters filter, awacses filter, short-final some), launchOne rescans for the ordinal index, and flyAircraft's hold phase re-filters the landing pattern per <=80ms sub-step — O(airbases x units) per tick plus a sub-step multiplier.

Examples: src/game/sim/aircraft.js:145 (fighters/awacses filters per base per tick), src/game/sim/aircraft.js:155 (
shortFinal w.units.some per base per tick), src/game/sim/aircraft.js:244 (in-pattern w.units.filter per landing
sub-step), src/game/sim/aircraft.js:124 (launchOne w.units.filter for orbit index)

**Recommendation:** Group live aircraft by baseId in one O(units) pass at the start of step() (a Map baseId ->
aircraft[]) and pass the group into runAirbase/flyAircraft; derive fighters/awacses/in-pattern counts from the group
instead of rescanning w.units.

### [MAJOR][ai-rules] AI tuning literals embedded in aiTick control flow instead of src/game/data/constants.js — roughly 17 distinct gameplay parameters (think cadence 3+rand*3, queue cap 2, stock target 4, buffers 60/300/100/150/120/200, chances 0.25/0.25/0.55, research floor 350, silo net floor 3, placement scatter 2.4deg/10 tries).

Examples: src/game/sim/tick.js:101, src/game/sim/tick.js:117, src/game/sim/tick.js:145, src/game/sim/tick.js:148,
src/game/sim/tick.js:167

**Recommendation:** Create one exported AI constants block in src/game/data/constants.js and reference it everywhere in
aiTick/aiSpot; this is a mechanical extraction with zero behavior change and makes /balance-check able to see AI
parameters at all.

### [MINOR][ai-rules] Governing documents point at locations the AI code no longer (or never) occupied, so rules and specs silently stop applying: ai-code.md is scoped to nonexistent src/ai/**, and the quick-spec cites src/game/engine.js and blesses knobs living 'in aiTick'.

Examples: .claude/rules/ai-code.md:3, design/quick-specs/ai-economy-fairness-and-bmd-rules.md:3,
design/quick-specs/ai-economy-fairness-and-bmd-rules.md:45

**Recommendation:** Sweep .claude/rules/*.md path scopes against the adapted layout (src/game/sim, src/game/data,
src/ui, src/map) and update quick-specs when code moves — otherwise path-scoped rules and audits check nothing.

### [MAJOR][network-security] Edge-function inputs receive type checks but never range or size checks, violating the adapted network rule "validate all incoming packet sizes and field ranges" — values flow straight into Postgres where they either error (500s that consume the fire-and-forget retry budget) or persist as garbage.

Examples: supabase/functions/db-account/index.ts:43-48 (startedAt any string, opponents any finite number, durationS
unbounded above, stats jsonb unbounded), supabase/functions/db-match/index.ts:417 (place inserts body.lng/body.lat raw —
NaN, strings, or out-of-range coordinates accepted), supabase/functions/db-match/index.ts:365,380 (body.slot used
unvalidated in removeParticipant/replaceWithAi lookups)

**Recommendation:** Add a small shared validation helper set (clampInt, clampNumber, isoDateOrNull, boundedJson) used by
both functions, and mirror the critical ranges as Postgres check constraints so a validator regression cannot corrupt
stored data.

### [MAJOR][network-security] No rate limiting or abuse controls on any backend endpoint — authenticated users can spam db-account writes and anonymous callers can spam db-match, in the same Supabase project that holds accounts, so abuse converts directly into quota exhaustion and forged aggregates.

Examples: supabase/functions/db-account/index.ts:31 (touch) and :38 (report_match) — unlimited per authenticated user,
supabase/functions/db-match/index.ts:298 (create), :317 (join), :466 (state) — unlimited and unauthenticated

**Recommendation:** Add per-user throttles inside the functions (cheap count-recent-rows checks before writes) and
per-IP limits at the platform layer (Supabase edge rate limiting/WAF); pair writes with idempotency keys so client
retries never double-insert.

### [MINOR][network-security] Raw internal error text is returned to clients — Postgres and runtime error messages (schema names, constraint names, stack-ish details) leak in error responses instead of generic codes.

Examples: supabase/functions/db-account/index.ts:34 and :50 (return json({error: error.message}, 500)),
supabase/functions/db-match/index.ts:489 (catch-all returns String(e.message) for any thrown error)

**Recommendation:** console.error the full detail inside the edge runtime (visible in Supabase function logs, which
contain no PII here) and return generic client-facing errors like {error: "write_failed"} with the appropriate status
code.

### [BLOCKING][coverage-gaps] 10 of 12 implemented gameplay systems have no GDD in design/gdd/, violating the framework rule that every mechanic gets a GDD before (or, for brownfield, alongside) implementation — the entire core loop is design-undocumented while only two peripheral systems (sensors, accounts) are covered.

Examples: src/game/sim/combat.js + tick.js:283-388 — combat/interception (launch, resolveHit, mirvSplit, hitProb) has no
GDD, src/game/sim/queries.js:36-58 — economy (incomeOf = (1.5 + 4·√gdp·econ + industry)·incomeMult, upkeep gating) has
no GDD, src/game/data/constants.js:484-628 — research/tech tree (TECHS multipliers) has no GDD,
src/game/data/constants.js:420-455 — warheads/munitions (WARHEADS, MIRV_SPLIT_AT, AMMO_START) has no GDD,
src/game/sim/tick.js:96 (aiTick) — AI opponent has only a quick-spec (
design/quick-specs/ai-economy-fairness-and-bmd-rules.md), not a GDD; sea routing (src/game/geo/seaRoute.js), diplomacy (
production.js:19-37), aircraft (aircraft.js), production queue (production.js), and saves (platform/saves.js) also lack
GDDs

**Recommendation:** Backfill via /reverse-document in balance-criticality order: (1) combat/interception + warheads —
the core loop, encoding hitProb cap 0.97, interceptor reload/points gating, MIRV split at 0.72, and per-warhead
damage/splash; (2) economy — the income/upkeep formulas every other system prices against, including the upkeep-unmet
rule that switches interceptors offline; (3) research/tech — compounding multipliers (incomeMult ×1.2/×1.25 stacking,
interceptAdd +0.10/+0.12 stacking toward the 0.97 cap, radarMult ×1.3) whose interaction limits are documented nowhere.
Update design/gdd/systems-index.md as each lands and run /design-review on each.

### [MAJOR][coverage-gaps] 11 of 12 systems have no ADR, violating coding-standards.md 'Every system must have a corresponding architecture decision record' — docs/architecture/ contains only adr-001-supabase-accounts.md, so foundational decisions (deterministic tick + seeded RNG, mutable single world-state object, sea-grid A* routing, seenBy track model) exist only in code comments.

Examples: src/game/sim/tick.js + worldState.js — tick/simulation architecture (fixed-step, seeded rand(), single mutable
world object) has no ADR, src/game/geo/seaRoute.js + seaGrid.js — sea routing grid/pathfinding has no ADR,
src/game/sim/queries.js:100-129 (sensorsOf/sensedBy) — the fog-of-war track model has a GDD but no ADR despite
introducing architecture (per src/CLAUDE.md this requires one), src/game/platform/saves.js — save/versioning strategy (
legacy-save migration is already a live concern per the sensors GDD edge cases) has no ADR

**Recommendation:** Author three ADRs via /architecture-decision, in this order: (1) simulation-tick architecture (
determinism contract, RNG seeding, facade pattern of engine.js) since every future test and multiplayer decision depends
on it; (2) sensors/fog-of-war track model (seenBy sets, 0.25s sweep, warnOnly semantics) to pair with its existing
GDD; (3) sea-grid routing. Then run /architecture-review to build the traceability matrix.

### [BLOCKING][coverage-gaps] Zero automated test coverage over a large surface of pure Logic code — every balance formula, state machine, and pathfinder in src/game/sim/ and src/game/geo/ ships unverified, and there is no CI gate, so the coding-standards BLOCKING rule for Logic stories has never been applied to any of the ~2,000 lines of simulation code.

Examples: src/game/sim/queries.js:14-63 — incomeOf/gdpOf/upkeepOf/netIncomeOf economy formulas (untested),
src/game/sim/tick.js:283-388 — interception loop: hitProb = min(0.97, intercept + interceptAdd), reload/points gating,
interceptor kinematics (untested), src/game/sim/combat.js:50-140 — launch cost/ammo consumption, resolveHit splash,
mirvSplit (untested), src/game/geo/seaRoute.js — sea pathfinding (untested), src/game/sim/aircraft.js:30-99 —
bearing/turn/advance kinematics and patrol fuel state machine (untested)

**Recommendation:** After test infrastructure lands (finding 1), write the first three suites matching the GDD backfill
priority: (1) economy — assert incomeOf/upkeepOf against hand-computed fixtures and the interceptors-offline boundary (
points <= 0 && netIncome < 0); (2) interception — assert hitProb capping at 0.97 as interceptAdd techs stack, and ammo
decrement per launch; (3) sea routing — determinism (same endpoints → same path) and land-avoidance. These pin the exact
formulas the missing GDDs must document, so tests and GDDs cross-validate each other.

