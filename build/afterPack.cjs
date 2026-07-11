const {execFileSync} = require("node:child_process");
const path = require("node:path");

// electron-builder can't sign with a real Developer ID (none is configured), so
// it skips signing and leaves the app carrying the linker's default ad-hoc
// signature — which no longer matches the repackaged bundle. Gatekeeper reads
// that broken seal as "damaged and can't be opened" on any downloaded copy.
//
// Re-sign the whole bundle ad-hoc here so the seal is valid and the app
// launches. Ad-hoc is not notarized, so a downloaded copy still shows the
// standard one-time "unidentified developer" approval (System Settings ->
// Privacy & Security -> Open Anyway) instead of being rejected outright.
// Proper Developer ID signing + notarization would remove that step entirely;
// when a signing identity is configured, electron-builder signs after this
// hook and its Developer ID signature replaces this ad-hoc one.
exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") return;
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {stdio: "inherit"});
};
