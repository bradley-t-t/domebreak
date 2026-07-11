import {useEffect, useState} from "react";
import {isUpdateAvailable} from "../../net/version.js";

// Polls the website's published build version and reports when this build is
// behind it. The website emits version.json from the same package.json every
// release ships from (web/vite.config.js), so "site says newer" means a release
// is live. This drives the UpdateOverlay prompt; the authoritative gate is the
// server's hello check — a client that never sees this (offline, blocked CDN)
// still can't join a match outdated.
const CLIENT_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;
const UPDATE_URL = import.meta.env.VITE_UPDATE_URL || "https://domebreak.com/version.json";
const CHECK_INTERVAL_MS = 15 * 60_000;

export default function useUpdateCheck() {
    const [latestVersion, setLatestVersion] = useState(null);
    useEffect(() => {
        // Dev builds churn versions meaninglessly — never nag there.
        if (!CLIENT_VERSION || import.meta.env.DEV) return;
        let live = true;
        const check = async () => {
            try {
                const res = await fetch(UPDATE_URL, {cache: "no-store"});
                if (!res.ok) return;
                const {version} = await res.json();
                if (live && typeof version === "string") setLatestVersion(version);
            } catch {
                // Offline or endpoint unreachable — quietly try again next sweep.
            }
        };
        check();
        const t = setInterval(check, CHECK_INTERVAL_MS);
        return () => {
            live = false;
            clearInterval(t);
        };
    }, []);
    return {
        currentVersion: CLIENT_VERSION,
        latestVersion,
        updateAvailable: !!(CLIENT_VERSION && latestVersion && isUpdateAvailable(CLIENT_VERSION, latestVersion)),
    };
}
