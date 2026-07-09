import {describe, expect, it} from "vitest";
import {rgbTuple} from "../../../src/lib/color.js";

describe("rgbTuple", () => {
    it("test_formats_triple_as_css_rgb", () => {
        expect(rgbTuple([12, 34, 56])).toBe("rgb(12,34,56)");
    });
});
