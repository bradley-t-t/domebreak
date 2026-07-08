import Nav from "./components/Nav.jsx";
import Hero from "./components/Hero.jsx";
import Manifesto from "./components/Manifesto.jsx";
import ShowcaseSection from "./components/ShowcaseSection.jsx";
import StatBand from "./components/StatBand.jsx";
import FeatureGrid from "./components/FeatureGrid.jsx";
import DownloadSection from "./components/DownloadSection.jsx";
import CtaBand from "./components/CtaBand.jsx";
import Footer from "./components/Footer.jsx";

export default function App() {
    return (
        <div className="relative min-h-screen bg-bg text-text">
            <Nav/>
            <main>
                <Hero/>
                <Manifesto/>

                <ShowcaseSection
                    index="01"
                    side="left"
                    kicker="The Living Map"
                    title="A world that fights back"
                    body="Every capital, border, and city is real geography rendered on a 3D globe. Toggle diplomacy, radar coverage, defense range, and population heat to read the theater at a glance."
                    points={[
                        "195 nations on the actual world map",
                        "Zoom from the whole globe down to a single city",
                        "Layer the map: diplomacy, radar, defense, population",
                    ]}
                    image="/shots/diplomacy.jpg"
                    imageAlt="DomeBreak globe with the diplomacy layer active, nations tinted by allegiance"
                />

                <ShowcaseSection
                    index="02"
                    side="right"
                    kicker="Build the Dome"
                    title="Early warning to intercept"
                    body="Blanket your territory in radar and early warning, then layer interceptors, THAAD, and area defense. Every launch site and sensor is placed by you and paid for in real points."
                    points={[
                        "Radar and early-warning coverage across your territory",
                        "Interceptors, THAAD, and area defense in depth",
                        "Objectives guide you from first bunker to full dome",
                    ]}
                    image="/shots/radar-coverage.jpg"
                    imageAlt="DomeBreak command console showing radar coverage over North America"
                />

                <StatBand/>

                <ShowcaseSection
                    index="03"
                    side="left"
                    kicker="Author the Strike"
                    title="Plan the attack, then let it fly"
                    body="Offense is deliberate. Open Battle Planning, pick your launchers, choose targets, route the trajectory across the globe, and commit. The whole plan plays out in real time."
                    points={[
                        "Author multi-launcher attack plans on the globe",
                        "Choose targets and preview trajectories before you commit",
                        "Warheads from standard to hypersonic and cluster",
                    ]}
                    image="/shots/battle-plan.jpg"
                    imageAlt="DomeBreak Battle Planning panel for authoring an attack plan"
                />

                <ShowcaseSection
                    index="04"
                    side="right"
                    kicker="Command the Economy"
                    title="Every silo is paid for"
                    body="Run a nation, not just an army. Balance GDP, industry, leadership, and stability while seven live-AI powers pressure your borders. Overreach and the home front cracks."
                    points={[
                        "GDP, industry, leadership, and stability all in play",
                        "Real-time clock — pause, or run from 0.5× to 10×",
                        "Diplomacy with every other live-AI power",
                    ]}
                    image="/shots/defense-range.jpg"
                    imageAlt="DomeBreak command console with the national economy panel and territory list"
                />

                <FeatureGrid/>
                <DownloadSection/>
                <CtaBand/>
            </main>
            <Footer/>
        </div>
    );
}
