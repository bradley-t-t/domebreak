import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {readFileSync} from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

// The game's package.json version is the single release version: the download
// page renders it and /version.json publishes it for the game client's update
// check (src/ui/hooks/useUpdateCheck.js). Never hardcode a version in web/.
const {version} = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8"));

// Marketing landing page — separate app from the game (src/). Deploys to Vercel
// with this `web/` folder as the project root. `@game` resolves to the game's
// own source so the animated hero globe reuses the real in-game engine/renderer
// (one source of truth, no copied code).
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        {
            name: "emit-version-json",
            generateBundle() {
                this.emitFile({type: "asset", fileName: "version.json", source: `${JSON.stringify({version})}\n`});
            },
        },
    ],
    define: {__APP_VERSION__: JSON.stringify(version)},
    resolve: {
        alias: {"@game": resolve(here, "../src")},
        // The game source (imported via @game from ../src) resolves its bare npm
        // imports from the game's ROOT node_modules, which isn't installed when
        // only this web workspace is (e.g. Vercel's build). Dedupe every shared
        // dependency so they all resolve from THIS app's node_modules instead —
        // this also keeps React a single instance so hooks don't break. Keep in
        // sync with the bare imports used under src/ (grep: from "<pkg>").
        dedupe: [
            "react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime",
            "react-map-gl", "maplibre-gl", "pmtiles",
            "clsx", "tailwind-merge", "class-variance-authority",
            "lucide-react", "@supabase/supabase-js",
        ],
    },
    server: {
        port: 5180,
        strictPort: false,
        fs: {allow: [resolve(here, ".."), here]},
    },
    build: {target: "es2022"},
});
