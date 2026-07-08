import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Marketing landing page — separate app from the game (src/). Deploys to Vercel
// with this `web/` folder as the project root.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {port: 5180, strictPort: false},
    build: {target: "es2022"},
});
