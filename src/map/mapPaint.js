// Country political-fill opacity by zoom. Far out the political wash is opaque;
// zooming in thins it so the real relief reads through. Shared by WorldMap's
// initial style and useMapVisualEffects' live layer toggle.
export const COUNTRY_FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 2, 0.96, 3, 0.9, 4, 0.62, 5.5, 0.24];
