// Server-side twin of the client's loadGameData: same JSON, read from disk
// (the deploy ships public/data and public/assets alongside the server).
import {readFileSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const here = dirname(fileURLToPath(import.meta.url));

// Parse a bundled JSON asset, tolerating absence (city-region.json is optional —
// its loss just degrades capture grouping to the state string, server-side too).
function readJson(root, rel, fallback = null) {
    try {
        return JSON.parse(readFileSync(join(root, rel), "utf8"));
    } catch {
        return fallback;
    }
}

let _data = null;

export function gameData() {
    if (_data) return _data;
    const root = join(here, "..");
    _data = {
        cities: readJson(root, "public/data/cities.json"),
        countries: readJson(root, "public/data/countries.json"),
        // city -> GID_1 province, so buildSetup stamps each city's region and the
        // server flips whole provinces exactly as the client does.
        cityRegion: readJson(root, "public/assets/city-region.json"),
    };
    return _data;
}
