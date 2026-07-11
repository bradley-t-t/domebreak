import {useMemo, useState} from "react";
import Nav from "./components/Nav.jsx";
import Hero from "./components/Hero.jsx";
import Manifesto from "./components/Manifesto.jsx";
import ShowcaseSection from "./components/ShowcaseSection.jsx";
import StatBand from "./components/StatBand.jsx";
import FeatureGrid from "./components/FeatureGrid.jsx";
import CtaBand from "./components/CtaBand.jsx";
import Footer from "./components/Footer.jsx";
import AuthModal from "./components/AuthModal.jsx";
import ShortcutsOverlay from "./components/ShortcutsOverlay.jsx";
import WikiPage from "./components/WikiPage.jsx";
import DownloadPage from "./components/DownloadPage.jsx";
import {AccountProvider} from "./components/AccountContext.jsx";
import {useAccount} from "./lib/accountStore.js";
import {useHotkeys} from "./hooks/useHotkeys.js";
import {useHashRoute, isWikiRoute, isDownloadRoute} from "./hooks/useHashRoute.js";
import {SHORTCUTS, scrollToId} from "./lib/nav.js";

function Landing({onSignIn, onShowShortcuts}) {
    return (
        <div className="relative min-h-screen bg-bg text-text">
            <Nav onSignIn={onSignIn}/>
            <main>
                {/* Alternating dark / light bands down the page. */}
                <Hero onSignIn={onSignIn}/>

                <div className="db-paper border-t border-line">
                    <Manifesto/>
                </div>

                <ShowcaseSection
                    index="01" side="left" icon="reconsat"
                    kicker="The world map"
                    title="A map you can actually read"
                    body="Every capital, border, and city is real geography on a 3D globe. Switch the view — diplomacy, radar coverage, defense range, population — to read the whole theater at a glance."
                    points={[
                        "222 nations on the real world map",
                        "Zoom from the whole globe down to a single city",
                        "Overlays: diplomacy, radar, defense range, population",
                    ]}
                    image="/shots/command-map.jpg"
                    imageAlt="DomeBreak command map of North America on the 3D globe"
                />

                <div className="db-paper border-y border-line">
                    <ShowcaseSection
                        index="02" side="right" icon="dome"
                        kicker="Build the dome"
                        title="Early warning to intercept"
                        body="Blanket your territory in radar and early warning, then layer interceptors, THAAD, and area defense. Every sensor and launch site is placed by you and paid for."
                        points={[
                            "Radar and early-warning coverage across your territory",
                            "Interceptors, THAAD, and area defense in depth",
                            "Objectives guide you from first bunker to full dome",
                        ]}
                        image="/shots/radar-coverage.jpg"
                        imageAlt="DomeBreak console showing radar coverage over North America"
                    />
                </div>

                <StatBand/>

                <div className="db-paper border-y border-line">
                    <ShowcaseSection
                        index="03" side="left" icon="silo"
                        kicker="Plan the strike"
                        title="Plan the attack, then let it fly"
                        body="Offense is deliberate. Open battle planning, pick your launchers, choose targets, route the trajectory across the globe, and commit. It all plays out in real time."
                        points={[
                            "Author multi-launcher attack plans on the globe",
                            "Choose targets and preview trajectories before you commit",
                            "Warheads from standard to hypersonic and cluster",
                        ]}
                        image="/shots/battle-plan.jpg"
                        imageAlt="DomeBreak battle planning panel"
                    />
                </div>

                <ShowcaseSection
                    index="04" side="right" icon="factory"
                    kicker="Run the nation"
                    title="Every silo is paid for"
                    body="You run a country, not just an army. Balance GDP, industry, and stability while rival nations pressure your borders. Overreach and the home front cracks."
                    points={[
                        "GDP, industry, leadership, and stability all in play",
                        "Real-time clock — pause, or run from 0.5× to 10×",
                        "Diplomacy with every rival nation",
                    ]}
                    image="/shots/wartime-command.jpg"
                    imageAlt="DomeBreak console at war — missiles in flight while the economy panel tracks the strain"
                />

                <div className="db-paper border-y border-line">
                    <FeatureGrid/>
                </div>

                <CtaBand/>
            </main>
            <Footer onShowShortcuts={onShowShortcuts}/>
        </div>
    );
}

function Shell() {
    const {signedIn} = useAccount();
    const [authOpen, setAuthOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [hash] = useHashRoute();
    const onWiki = isWikiRoute(hash);
    const onDownload = isDownloadRoute(hash);

    const handlers = useMemo(() => {
        const h = {};
        for (const s of SHORTCUTS) h[s.key] = () => scrollToId(s.target);
        h["s"] = () => !signedIn && setAuthOpen(true);
        h["?"] = () => setShortcutsOpen((v) => !v);
        return h;
    }, [signedIn]);
    useHotkeys(handlers);

    const openSignIn = () => setAuthOpen(true);
    const openShortcuts = () => setShortcutsOpen(true);

    return (
        <>
            {onWiki
                ? <WikiPage onSignIn={openSignIn} onShowShortcuts={openShortcuts}/>
                : onDownload
                    ? <DownloadPage onSignIn={openSignIn} onShowShortcuts={openShortcuts}/>
                    : <Landing onSignIn={openSignIn} onShowShortcuts={openShortcuts}/>}

            <AuthModal open={authOpen} onClose={() => setAuthOpen(false)}/>
            <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)}/>
        </>
    );
}

export default function App() {
    return (
        <AccountProvider>
            <Shell/>
        </AccountProvider>
    );
}
