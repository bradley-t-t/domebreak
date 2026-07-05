import { SLOT_COLOR } from "../../game/constants.js";
import Flag from "../Flag.jsx";

export default function DiplomacyPanel({ world, api, mySlot }) {
  const me = world.nations.find((n) => n.slot === mySlot);
  return (
    <div className="gd-panel-body">
      <div className="gd-panel-title">Nations</div>
      <div className="gd-natlist">
        {world.nations.map((n) => {
          const cities = world.cities.filter((c) => c.slot === n.slot && c.alive).length;
          const isMe = n.slot === mySlot;
          const war = me?.relations[n.slot] === "war";
          return (
            <div key={n.slot} className={`gd-natcard ${!n.alive ? "dead" : ""}`}>
              <span className="gd-nat-flag" style={{ borderColor: SLOT_COLOR[n.slot] }}><Flag iso={n.iso}/></span>
              <div className="gd-nat-info"><b>{n.name}{isMe ? " (you)" : ""}</b><span>{cities} cities{n.alive ? "" : " · eliminated"}</span></div>
              {isMe ? <span className="gd-badge you">You</span>
                : !n.alive ? <span className="gd-badge">—</span>
                : war ? <button className="gd-mini" onClick={() => api.makePeace(n.slot)}>Peace</button>
                : <button className="gd-mini danger" onClick={() => api.declareWar(n.slot)}>War</button>}
            </div>
          );
        })}
      </div>
      <div className="gd-place-hint subtle">At war? Select a launcher → Command attack → click their city.</div>
    </div>
  );
}
