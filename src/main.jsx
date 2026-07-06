import React from "react";
import {createRoot} from "react-dom/client";
import App from "./App.jsx";
import {hydrateLocalData} from "./game/platform/localData.js";
import "./index.css";
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
