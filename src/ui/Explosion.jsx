// Compact fire explosion — orange for missile impacts, green for interceptions.
const EMBERS = [-50, -12, 28, 92, 150, 214];

export default function Explosion({kind = "hit"}) {
    return (
        <div className={`gd-explosion ${kind}`}>
            <span className="gd-fx-flash"/>
            <span className="gd-fx-fire"/>
            <span className="gd-fx-fire two"/>
            <span className="gd-fx-smoke"/>
            {EMBERS.map((a, i) => <i key={i} className="gd-ember" style={{"--a": `${a}deg`}}/>)}
        </div>
    );
}
