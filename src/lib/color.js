// Tiny colour primitives shared by MapLibre paint code.

// Format an [r, g, b] triple as a CSS `rgb(r,g,b)` string.
export function rgbTuple(triple) {
    return `rgb(${triple[0]},${triple[1]},${triple[2]})`;
}
