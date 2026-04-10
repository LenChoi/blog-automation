import { describe, it, expect } from "vitest";
import { shouldIncludeLink } from "../engine/link-decider";

describe("shouldIncludeLink", () => {
  it("naver: returns false when postCount < 10", () => {
    const result = shouldIncludeLink("naver", 5, false);
    expect(result).toBe(false);
  });

  it("naver: returns false when linkEnabled is false", () => {
    const result = shouldIncludeLink("naver", 15, false);
    expect(result).toBe(false);
  });

  it("naver: returns boolean when linkEnabled and postCount >= 10", () => {
    let trueCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (shouldIncludeLink("naver", 15, true)) trueCount++;
    }
    expect(trueCount).toBeGreaterThan(100);
    expect(trueCount).toBeLessThan(300);
  });

  it("tistory: returns boolean with 30-40% probability", () => {
    let trueCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (shouldIncludeLink("tistory", 5, true)) trueCount++;
    }
    expect(trueCount).toBeGreaterThan(200);
    expect(trueCount).toBeLessThan(500);
  });
});
