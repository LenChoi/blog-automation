import { describe, it, expect } from "vitest";
import { checkBannedPhrases, checkLength, checkKeywordDensity } from "../engine/validator";

describe("checkBannedPhrases", () => {
  it("returns empty array for clean text", () => {
    const result = checkBannedPhrases("지난 주에 꽃다발을 샀거든요. 진짜 예쁘더라고요.");
    expect(result).toHaveLength(0);
  });

  it("detects banned phrases", () => {
    const result = checkBannedPhrases("오늘은 꽃배달에 대해 알아보겠습니다.");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain("알아보겠습니다");
  });

  it("detects multiple banned phrases", () => {
    const text = "다양한 꽃이 있습니다. 도움이 되셨으면 좋겠습니다.";
    const result = checkBannedPhrases(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

describe("checkLength", () => {
  it("returns true for valid length", () => {
    const text = "가".repeat(1800);
    expect(checkLength(text)).toBe(true);
  });

  it("returns false for too short", () => {
    const text = "가".repeat(500);
    expect(checkLength(text)).toBe(false);
  });

  it("returns false for too long", () => {
    const text = "가".repeat(3000);
    expect(checkLength(text)).toBe(false);
  });
});

describe("checkKeywordDensity", () => {
  it("returns density percentage", () => {
    const text = "꽃배달 서비스를 이용해봤어요. 꽃배달은 정말 편하더라고요. 꽃배달 추천합니다." + "가".repeat(70);
    const density = checkKeywordDensity(text, "꽃배달");
    expect(density).toBeGreaterThan(0);
  });
});
