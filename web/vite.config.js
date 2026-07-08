import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Marketing landing page — separate app from the game (src/). Deploys to Vercel
// with this `web/` folder as the project root. `@game` resolves to the game's
// own source so the animated hero globe reuses the real in-game engine/renderer
// (one source of truth, no copied code).
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {"@game": resolve(here, "../src")},
        // The game source (imported via @game from ../src) resolves its own bare
        // "react", which would load a second React copy and break hooks. Force a
        // single instance from this app's node_modules.
        dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "react-map-gl", "maplibre-gl", "pmtiles"],
    },
    server: {
        port: 5180,
        strictPort: false,
        fs: {allow: [resolve(here, ".."), here]},
    },
    build: {target: "es2022"},
});
