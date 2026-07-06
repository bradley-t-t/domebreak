import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// pmtiles ship as static assets and are read client-side via HTTP range
// requests, so no app server is required to serve the map.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {port: 5173},
    build: {target: "es2022", chunkSizeWarningLimit: 1500},
});
