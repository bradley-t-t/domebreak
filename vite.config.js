import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {readFileSync} from "node:fs";

const {version} = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

// pmtiles ship as static assets and are read client-side via HTTP range
// requests, so no app server is required to serve the map.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {port: 5173},
    build: {target: "es2022", chunkSizeWarningLimit: 1500},
    // Surface the package version to the client so the menu can show the build.
    define: {__APP_VERSION__: JSON.stringify(version)},
});
