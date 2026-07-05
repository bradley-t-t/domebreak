import { SLOT_COLOR } from "../../game/constants.js";

export default function DiplomacyPanel({ world, api, mySlot }) {
  const me = world.nations.find((n) => n.slot === mySlot);
  return (
    <div className="gd-panel-body">
      <div className="gd-panel-title">Diplomacy</div>
      <div className="gd-list">
        {world.nations.map((n) => {
          const cities = world.cities.filter((c) => c.slot === n.slot && c.alive).length;
          const isMe = n.slot === mySlot;
          const war = me?.relations[n.slot] === "war";
          return (
            <div key={n.slot} className={`gd-nation ${!n.alive ? "dead" : ""}`}>
              <span className="gd-slot-dot" style={{ background: SLOT_COLOR[n.slot], boxShadow: `0 0 6px ${SLOT_COLOR[n.slot]}` }} />
              <span className="gd-arsenal-info"><b>{n.name}{isMe ? " (you)" : ""}</b><span>{cities} cities{n.alive ? "" : " · eliminated"}</span></span>
              {isMe ? <span className="gd-badge you">You</span>
                : !n.alive ? <span className="gd-badge">—</span>
                : war ? <button className="gd-mini" onClick={() => api.makePeace(n.slot)}>Peace</button>
                : <button className="gd-mini danger" onClick={() => api.declareWar(n.slot)}>Declare war</button>}
            </div>
          );
        })}
      </div>
      <div className="gd-place-hint subtle">At war? Select one of your launchers on the map → <b>Command attack</b> → click their city.</div>
    </div>
  );
}
