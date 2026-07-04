import Board from "./map/Board.jsx";

export default function App() {
  return (
    <div className="gd-app">
      <header className="gd-topbar">
        <span className="gd-logo">GOLDEN<span className="gd-logo-accent">DOME</span></span>
        <span className="gd-phase">Foundation build</span>
      </header>
      <main className="gd-stage">
        <Board />
      </main>
    </div>
  );
}
