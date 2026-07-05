const KEY = "goldendome.settings";
export const DEFAULT_SETTINGS = { speed: 1, globe: true, reduceMotion: false, opponents: 5 };
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
