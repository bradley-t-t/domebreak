import React from "react";
import {createRoot} from "react-dom/client";
import App from "./App.jsx";
import {hydrateLocalData} from "./game/platform/localData.js";
// Tailwind first so legacy styles.css still wins any cascade conflict during
// the migration (ADR-0005). Both coexist until Phase 4 deletes styles.css.
import "./index.css";
import "./styles.css";
import "flag-icons/css/flag-icons.min.css";

// On desktop, pull the machine-local data folder into localStorage before
// anything reads saves/settings/auth. Instant no-op in the browser.
hydrateLocalData().then(() => {
    createRoot(document.getElementById("root")).render(
        <React.StrictMode>
            <App/>
        </React.StrictMode>
    );
});
