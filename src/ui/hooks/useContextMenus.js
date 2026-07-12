// Right-click context-menu construction for cities and units — the "Pin", "Declare War",
// "Command Attack", hangar-order, embark/disembark and dismantle item builders — plus the
// shared pin-add helper and the menu state itself.
import {useState} from "react";
import {hangarCapOf, hangarCount, haversine, isActive, isAttacker, SCRAP_REFUND_FRAC, UNITS} from "../../game/engine.js";
import {DIPLOMACY} from "../../game/data/constants.js";

// Client-side amphibious lift radius — mirrors AMPHIB_LIFT_KM in production.js so
// the context menu only offers embark on ground units the engine will accept.
const AMPHIB_LIFT_KM = 120;

export function useContextMenus({
                                     w, mySlot, myNation, api, selUnit,
                                     relation, nationName, labelOf, teamColor, flash,
                                     setSelUnit, setAttackMode, setMoving, setFollowing, setPlacing, setDisembarkId, setPins
                                 }) {
    const [menu, setMenu] = useState(null);

    const addPin = (type, ent) => {
        const key = `${type}-${ent.id}`;
        setPins((p) => p.some((x) => x.key === key) ? p : [...p, {
            key,
            type,
            id: ent.id,
            label: type === "city" ? ent.name : labelOf(ent.type, ent.slot),
            lng: ent.lng,
            lat: ent.lat,
            color: teamColor(ent.slot)
        }]);
    };
    const openCityMenu = (id, ev) => {
        const c = w.cities.find((x) => x.id === id);
        if (!c) return;
        const mine = c.slot === mySlot;
        // Neutral (inactive) nations are scenery — no war, alliance, or targeting.
        // Mirrors the guard in LiveGame's onCityClick; Pin still works so the map
        // pin bar can hold a neutral landmark.
        if (!mine && !isActive(w, c.slot)) {
            setMenu({
                title: `${c.name}${c.state ? " · " + c.state : ""}`,
                items: [{label: "Pin", onClick: () => addPin("city", c)}],
                x: ev.clientX, y: ev.clientY
            });
            return;
        }
        const rel = relation(c.slot);
        const sel = w.units.find((u) => u.id === selUnit);
        const items = [];
        if (!mine) {
            if (rel === "war") items.push({
                label: "Target with Selected",
                disabled: !(sel && isAttacker(UNITS[sel.type])),
                onClick: () => {
                    const r = api.commandAttack(selUnit, c.id);
                    if (r.error) flash(r.error);
                }
            }); else if (rel === "ally") items.push({
                label: `Break Alliance with ${nationName(c.slot)}`,
                danger: true,
                onClick: () => api.breakAlliance(c.slot)
            }); else {
                items.push({
                    label: `Propose Alliance to ${nationName(c.slot)}`,
                    onClick: () => {
                        const r = api.proposeAlliance(c.slot);
                        if (r?.error) flash(r.error);
                        else flash(`Alliance proposed to ${nationName(c.slot)}.`, "info");
                    }
                });
                const graceSec = w.rules?.playerGraceSec ?? DIPLOMACY.playerGraceSec;
                const graceActive = graceSec > 0 && (w.time ?? 0) < graceSec;
                items.push({
                    label: graceActive
                        ? `Declare War on ${nationName(c.slot)} (Grace)`
                        : `Declare War on ${nationName(c.slot)}`,
                    danger: true,
                    disabled: graceActive,
                    onClick: () => api.declareWar(c.slot)
                });
            }
        }
        items.push({label: "Pin", onClick: () => addPin("city", c)});
        setMenu({title: `${c.name}${c.state ? " · " + c.state : ""}`, items, x: ev.clientX, y: ev.clientY});
    };
    const openUnitMenu = (u, ev) => {
        ev.preventDefault();
        const mine = u.slot === mySlot;
        const off = isAttacker(UNITS[u.type]);
        const items = [];
        if (mine && off) items.push(u.targetId ? {
            label: "Hold Fire",
            onClick: () => api.commandAttack(u.id, null)
        } : {
            label: "Command Attack", onClick: () => {
                setSelUnit(u.id);
                setAttackMode(true);
            }
        });
        if (mine) items.push({
            label: UNITS[u.type].navalSpeed ? "Set Sail" : UNITS[u.type].landSpeed ? "March" : "Move (Relocate)",
            onClick: () => {
                setMoving(u.id);
                setPlacing(null);
                setSelUnit(u.id);
            }
        });
        if (mine && (UNITS[u.type].navalSpeed || UNITS[u.type].landSpeed) && u.dest) items.push({
            label: UNITS[u.type].navalSpeed ? "All Stop" : "Halt",
            onClick: () => api.stopSail(u.id)
        });
        // Naval formation: keep station on another of your ships, or break off.
        if (mine && UNITS[u.type].navalSpeed) items.push(u.followId ? {
            label: "Break Formation",
            onClick: () => api.stopFollow(u.id)
        } : {
            label: "Follow Ship…",
            onClick: () => {
                setFollowing(u.id);
                setMoving(null);
                setPlacing(null);
                setSelUnit(u.id);
            }
        });
        // Airbases: order replacement aircraft into the hangar (per-type capacity).
        if (mine && UNITS[u.type].wing) {
            for (const at of [...new Set(UNITS[u.type].wing)]) {
                const stocked = hangarCount(w, myNation, u.id, at);
                items.push({
                    label: `Order ${labelOf(at, mySlot)} · ${stocked}/${hangarCapOf(u.type, at)} (◆ ${UNITS[at].cost})`,
                    disabled: stocked >= hangarCapOf(u.type, at),
                    onClick: () => {
                        const r = api.queueAircraft(u.id, at);
                        flash(r.error || `${labelOf(at, mySlot)} added to the production queue.`, r.error ? "err" : "info");
                    },
                });
            }
        }
        // Amphibious transport: embark nearby friendly ground units (one menu item
        // each, within lift range and while there's spare capacity) and land the
        // current cargo at a coastal point the player clicks.
        if (mine && UNITS[u.type].capacity) {
            const cap = UNITS[u.type].capacity;
            const loaded = u.cargo?.length || 0;
            if (loaded < cap) {
                const nearby = w.units.filter((g) => g.slot === mySlot && g.hp > 0 && UNITS[g.type].landSpeed
                    && UNITS[g.type].domain === "land" && haversine(u.lng, u.lat, g.lng, g.lat) <= AMPHIB_LIFT_KM);
                for (const g of nearby.slice(0, 6)) items.push({
                    label: `Embark ${labelOf(g.type, g.slot)}`,
                    onClick: () => {
                        const r = api.embark(u.id, g.id);
                        flash(r.error || `${labelOf(g.type, g.slot)} embarked (${r.cargo}/${cap}).`, r.error ? "err" : "info");
                    }
                });
                if (!nearby.length) items.push({label: "No troops in lift range", disabled: true, onClick: () => {}});
            }
            if (loaded) items.push({
                label: `Disembark here (${loaded} aboard)`,
                onClick: () => {
                    setDisembarkId(u.id);
                    setMoving(null);
                    setPlacing(null);
                    setSelUnit(u.id);
                    flash("Landing — click a coastal point in your territory.", "info");
                }
            });
        }
        if (mine) items.push({
            label: `Dismantle (Sell +${Math.round(SCRAP_REFUND_FRAC * 100)}%)`, danger: true, onClick: () => {
                api.scrap(u.id);
                if (selUnit === u.id) setSelUnit(null);
            }
        });
        items.push({label: "Pin", onClick: () => addPin("unit", u)});
        setMenu({title: labelOf(u.type, u.slot), items, x: ev.clientX, y: ev.clientY});
    };

    return {menu, setMenu, openCityMenu, openUnitMenu};
}
