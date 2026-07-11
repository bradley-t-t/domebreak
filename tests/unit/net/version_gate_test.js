// Version compatibility policy (src/net/version.js): the server and client run
// the SAME simulation, so multiplayer admits only an EXACT version match —
// clientAllowed must refuse older AND newer clients, and refuse anything
// unparseable rather than fail open. isUpdateAvailable drives the update
// prompt and must only fire when the published version is strictly newer.
// Deterministic.
import {describe, expect, it} from "vitest";
import {clientAllowed, compareVersions, isUpdateAvailable, parseVersion} from "../../../src/net/version.js";

describe("parseVersion", () => {
    it("test_parses_dotted_numeric_versions", () => {
        expect(parseVersion("1.3.3")).toEqual([1, 3, 3]);
        expect(parseVersion("v1.3.3")).toEqual([1, 3, 3]); // leading v tolerated
        expect(parseVersion(" 1.3.3 ")).toEqual([1, 3, 3]);
        expect(parseVersion("2.0")).toEqual([2, 0]);
    });
    it("test_rejects_non_versions", () => {
        expect(parseVersion("")).toBeNull();
        expect(parseVersion(null)).toBeNull();
        expect(parseVersion(undefined)).toBeNull();
        expect(parseVersion("dev")).toBeNull();
        expect(parseVersion("1.3.3-beta")).toBeNull(); // releases are plain X.Y.Z
        expect(parseVersion(133)).toBeNull();
    });
});

describe("compareVersions", () => {
    it("test_orders_by_major_minor_patch", () => {
        expect(compareVersions("1.3.3", "1.3.4")).toBeLessThan(0);
        expect(compareVersions("1.4.0", "1.3.9")).toBeGreaterThan(0);
        expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
        expect(compareVersions("1.3.3", "1.3.3")).toBe(0);
    });
    it("test_missing_segments_read_as_zero", () => {
        expect(compareVersions("1.3", "1.3.0")).toBe(0);
        expect(compareVersions("1.3", "1.3.1")).toBeLessThan(0);
    });
    it("test_unparseable_sorts_below_everything", () => {
        expect(compareVersions("dev", "0.0.1")).toBeLessThan(0);
        expect(compareVersions("1.0.0", "garbage")).toBeGreaterThan(0);
        expect(compareVersions("junk", "junk")).toBe(0);
    });
});

describe("isUpdateAvailable — the update-prompt trigger", () => {
    it("test_fires_only_when_remote_is_strictly_newer", () => {
        expect(isUpdateAvailable("1.3.3", "1.3.4")).toBe(true);
        expect(isUpdateAvailable("1.3.3", "2.0.0")).toBe(true);
        expect(isUpdateAvailable("1.3.3", "1.3.3")).toBe(false);
        expect(isUpdateAvailable("1.3.3", "1.3.2")).toBe(false);
    });
    it("test_never_fires_on_garbage_remote", () => {
        expect(isUpdateAvailable("1.3.3", "")).toBe(false);
        expect(isUpdateAvailable("1.3.3", "not-a-version")).toBe(false);
    });
});

describe("clientAllowed — the multiplayer hello gate", () => {
    it("test_admits_exact_match_only", () => {
        expect(clientAllowed("1.3.3", "1.3.3")).toBe(true);
        expect(clientAllowed("v1.3.3", "1.3.3")).toBe(true);
        expect(clientAllowed("1.3.2", "1.3.3")).toBe(false); // outdated client
        expect(clientAllowed("1.3.4", "1.3.3")).toBe(false); // NEWER client too: same-sim policy
    });
    it("test_fails_closed_on_missing_or_garbage_versions", () => {
        expect(clientAllowed(undefined, "1.3.3")).toBe(false); // pre-gate client sends no v
        expect(clientAllowed("", "1.3.3")).toBe(false);
        expect(clientAllowed("dev", "1.3.3")).toBe(false);
        expect(clientAllowed("1.3.3", "garbage")).toBe(false);
    });
});
