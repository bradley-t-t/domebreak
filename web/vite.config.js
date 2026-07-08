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
