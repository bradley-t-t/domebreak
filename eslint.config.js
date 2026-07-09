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
            // Render-phase ref/mutation patterns surface as warnings, not errors.
            "react-hooks/refs": "warn",
            "react-hooks/immutability": "warn",
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/incompatible-library": "warn",
        },
    },
];
