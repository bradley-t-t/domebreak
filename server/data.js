// Server-side twin of the client's loadGameData: same JSON, read from disk
// (the deploy ships public/data alongside the server).
import {readFileSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const here = dirname(fileURLToPath(import.meta.url));

let _data = null;

export function gameData() {
    if (_data) return _data;
    const root = join(here, "..");
    _data = {
        cities: JSON.parse(readFileSync(join(root, "public/data/cities.json"), "utf8")),
        countries: JSON.parse(readFileSync(join(root, "public/data/countries.json"), "utf8")),
    };
    return _data;
}
