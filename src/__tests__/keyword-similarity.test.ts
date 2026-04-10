import { describe, it, expect } from "vitest";
import { isSimilar, tokenize } from "../engine/keyword-similarity";

describe("tokenize", () => {
  it("splits Korean text into space-separated tokens", () => {
    expect(tokenize("장례식 화환 가격")).toEqual(["장례식", "화환", "가격"]);
  });

  it("handles single word", () => {
    expect(tokenize("꽃배달")).toEqual(["꽃배달"]);
  });
});

describe("isSimilar", () => {
  it("returns true for identical keywords", () => {
    expect(isSimilar("장례식 화환 가격", "장례식 화환 가격")).toBe(true);
  });

  it("returns true for 70%+ overlap", () => {
    expect(isSimilar("장례식 화환 가격", "장례식 화환 가격대")).toBe(true);
  });

  it("returns false for low overlap", () => {
    expect(isSimilar("장례식 화환 가격", "꽃다발 선물 추천")).toBe(false);
  });

  it("returns false for partial overlap below threshold", () => {
    expect(isSimilar("장례식 화환 가격", "장례식 꽃다발 추천")).toBe(false);
  });
});
