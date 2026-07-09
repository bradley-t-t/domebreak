import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
    {ignores: ["**/dist", "release", "node_modules"]},
    {
        files: ["**/*.{js,jsx,mjs}"],
        languageOptions: {
            ecmaVersion: 2023,
            globals: {...globals.browser, ...globals.node},
            parserOptions: {
                ecmaVersion: "latest",
                ecmaFeatures: {jsx: true},
                sourceType: "module",
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": "warn",
            "no-unused-vars": ["error", {varsIgnorePattern: "^[A-Z_]"}],
            "react-hooks/refs": "warn",
            "react-hooks/immutability": "warn",
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/incompatible-library": "warn",
        },
    },
    {
        // The game engine keeps one world object in a ref, mutates it in place, and
        // re-renders on a tick counter (see useEngine); components read the world and
        // map refs during render and sync external state (Supabase realtime, the
        // attract sim) in effects by design. These render-phase rules don't model
        // that, so they're off for the game code. The web app keeps them enforced.
        files: ["src/**/*.{js,jsx}"],
        rules: {
            "react-hooks/refs": "off",
            "react-hooks/immutability": "off",
            "react-hooks/set-state-in-effect": "off",
        },
    },
];
