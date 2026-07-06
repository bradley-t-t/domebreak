import {defineConfig} from "vitest/config";

// Engine unit tests are pure Node (no DOM). Files follow the project's
// `[system]_[feature]_test.js` convention under tests/. JSX uses the automatic
// runtime so UI components render in tests without importing React — matching
// the app's Vite build (components never import React).
export default defineConfig({
    esbuild: {jsx: "automatic"},
    test: {
        include: ["tests/**/*_test.js"],
        environment: "node",
    },
});
