import {defineConfig} from "vitest/config";

// Engine unit tests are pure Node (no DOM). Files follow the project's
// `[system]_[feature]_test.js` convention under tests/.
export default defineConfig({
    test: {
        include: ["tests/**/*_test.js"],
        environment: "node",
    },
});
