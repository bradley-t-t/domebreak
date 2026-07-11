// Render smoke for the update prompt (src/ui/screens/UpdateOverlay.jsx): the
// desktop app with the updater bridge gets the automated Update Now flow plus
// the manual-download fallback link, an old desktop shell without the bridge
// keeps the website link, and a browser client is told to reload. Node-env via
// react-dom/server; the live progress wiring is main-process behavior covered
// by tests/unit/electron/updater_test.js.
import {afterEach, describe, expect, it} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import UpdateOverlay from "../../../src/ui/screens/UpdateOverlay.jsx";

const render = (props) => renderToStaticMarkup(
    React.createElement(UpdateOverlay, {currentVersion: "1.6.0", latestVersion: "1.7.0", onDismiss() {}, ...props})
);

afterEach(() => {
    delete globalThis.window;
});

describe("UpdateOverlay", () => {
    it("test_desktop_app_with_the_updater_bridge_updates_in_place", () => {
        globalThis.window = {dbLocal: {}, dbUpdater: {start: async () => {}, onProgress: () => () => {}}};
        const html = render();
        expect(html).toContain("Update Now");
        expect(html).toContain("or download the update manually");
        expect(html).toContain("https://domebreak.com/#/download");
        expect(html).toContain("Not Now");
        expect(html).not.toContain("Get the Update");
    });

    it("test_desktop_shell_without_the_bridge_falls_back_to_the_website", () => {
        globalThis.window = {dbLocal: {}};
        const html = render();
        expect(html).toContain("Get the Update");
        expect(html).toContain("https://domebreak.com/#/download");
        expect(html).not.toContain("Update Now");
    });

    it("test_browser_client_is_told_to_reload", () => {
        const html = render();
        expect(html).toContain("Reload to Update");
        expect(html).not.toContain("Update Now");
        expect(html).not.toContain("Get the Update");
    });

    it("test_names_both_versions_in_the_prompt", () => {
        const html = render();
        expect(html).toContain("v1.7.0");
        expect(html).toContain("v1.6.0");
    });

    it("test_forced_desktop_update_is_mandatory_with_no_opt_out", () => {
        globalThis.window = {dbLocal: {}, dbUpdater: {start: async () => {}, onProgress: () => () => {}}};
        const html = render({forced: true});
        expect(html).toContain("Update Required");
        // No escape while a self-updating build is forced (only surfaces after a
        // failed install, which SSR never reaches).
        expect(html).not.toContain("Not Now");
        expect(html).not.toContain("Play Offline");
    });

    it("test_forced_without_a_self_updater_still_lets_the_player_out", () => {
        // A forced overlay on a shell that can't update itself must never trap
        // the player — the bail-out stays available.
        globalThis.window = {dbLocal: {}};
        const html = render({forced: true});
        expect(html).toContain("Play Offline");
    });
});
