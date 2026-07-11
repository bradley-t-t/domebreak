// The auto-updater's pure decisions (electron/updater.cjs): which stable
// download URL a build updates from, how the macOS bundle path is resolved
// from the running executable, and which install locations block an in-place
// swap. The runtime flow (download, NSIS handoff, dmg swap) rides on these.
import {describe, expect, it} from "vitest";
import {installerUrl, macBundlePath, macInstallBlockReason} from "../../../electron/updater.cjs";

describe("installerUrl", () => {
    it("test_maps_every_shipped_platform_arch_to_its_stable_artifact", () => {
        expect(installerUrl("darwin", "arm64")).toBe("https://download.domebreak.com/DomeBreak-mac-arm64.dmg");
        expect(installerUrl("darwin", "x64")).toBe("https://download.domebreak.com/DomeBreak-mac-x64.dmg");
        expect(installerUrl("win32", "x64")).toBe("https://download.domebreak.com/DomeBreak-win-x64.exe");
        expect(installerUrl("win32", "arm64")).toBe("https://download.domebreak.com/DomeBreak-win-arm64.exe");
        expect(installerUrl("win32", "ia32")).toBe("https://download.domebreak.com/DomeBreak-win-ia32.exe");
    });

    it("test_returns_null_for_platforms_without_a_published_installer", () => {
        expect(installerUrl("linux", "x64")).toBeNull();
        expect(installerUrl("darwin", "ia32")).toBeNull();
        expect(installerUrl("win32", "mips")).toBeNull();
    });
});

describe("macBundlePath", () => {
    it("test_resolves_the_app_bundle_from_the_running_binary", () => {
        expect(macBundlePath("/Applications/DomeBreak.app/Contents/MacOS/DomeBreak"))
            .toBe("/Applications/DomeBreak.app");
    });

    it("test_returns_null_outside_an_app_bundle", () => {
        expect(macBundlePath("/Users/dev/domebreak/node_modules/electron/dist/Electron")).toBeNull();
    });
});

describe("macInstallBlockReason", () => {
    it("test_allows_a_normally_installed_bundle", () => {
        expect(macInstallBlockReason("/Applications/DomeBreak.app")).toBeNull();
        expect(macInstallBlockReason("/Users/me/Downloads/DomeBreak.app")).toBeNull();
    });

    it("test_blocks_translocated_and_disk_image_runs_with_a_reason", () => {
        expect(macInstallBlockReason(null)).toMatch(/not running from an installed/);
        expect(macInstallBlockReason("/private/var/folders/x/AppTranslocation/y/d/DomeBreak.app"))
            .toMatch(/Applications folder/);
        expect(macInstallBlockReason("/Volumes/DomeBreak 1.6.0/DomeBreak.app"))
            .toMatch(/disk image/);
    });
});
