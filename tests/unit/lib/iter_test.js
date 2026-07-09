import {describe, expect, it} from "vitest";
import {byId, cmpStr, countBy, indexBy} from "../../../src/lib/iter.js";

describe("byId", () => {
    it("test_finds_matching_element", () => {
        const arr = [{id: "a"}, {id: "b"}, {id: "c"}];
        expect(byId(arr, "b")).toBe(arr[1]);
    });
    it("test_returns_undefined_when_absent", () => {
        expect(byId([{id: "a"}], "z")).toBeUndefined();
    });
});

describe("countBy", () => {
    it("test_tallies_by_key", () => {
        const m = countBy(["a", "b", "a", "c", "b", "a"], (x) => x);
        expect(m.get("a")).toBe(3);
        expect(m.get("b")).toBe(2);
        expect(m.get("c")).toBe(1);
    });
    it("test_uses_weight_fn_when_provided", () => {
        const m = countBy(
            [{slot: 0, n: 5}, {slot: 1, n: 2}, {slot: 0, n: 7}],
            (x) => x.slot,
            (x) => x.n,
        );
        expect(m.get(0)).toBe(12);
        expect(m.get(1)).toBe(2);
    });
});

describe("indexBy", () => {
    it("test_returns_lookup_map_of_elements", () => {
        const arr = [{id: "a", n: 1}, {id: "b", n: 2}];
        const m = indexBy(arr, (x) => x.id);
        expect(m.get("a")).toBe(arr[0]);
        expect(m.get("b")).toBe(arr[1]);
    });
    it("test_extracts_value_when_valueFn_given", () => {
        const m = indexBy([{id: "a", n: 1}, {id: "b", n: 2}], (x) => x.id, (x) => x.n);
        expect(m.get("a")).toBe(1);
        expect(m.get("b")).toBe(2);
    });
});

describe("cmpStr", () => {
    it("test_sorts_strings_alphabetically", () => {
        const out = ["banana", "apple", "cherry"].sort(cmpStr());
        expect(out).toEqual(["apple", "banana", "cherry"]);
    });
    it("test_sorts_by_key_getter", () => {
        const arr = [{id: "c"}, {id: "a"}, {id: "b"}];
        arr.sort(cmpStr((x) => x.id));
        expect(arr.map((x) => x.id)).toEqual(["a", "b", "c"]);
    });
});
