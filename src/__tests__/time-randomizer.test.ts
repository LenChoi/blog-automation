import { describe, it, expect } from "vitest";
import { generatePublishTime, shouldPublishToday } from "../scheduler/time-randomizer";

describe("generatePublishTime", () => {
  it("returns a Date within 8:00~22:00 range", () => {
    for (let i = 0; i < 50; i++) {
      const time = generatePublishTime("naver", new Date("2026-04-10"));
      const hour = time.getHours();
      expect(hour).toBeGreaterThanOrEqual(8);
      expect(hour).toBeLessThanOrEqual(22);
    }
  });

  it("two blogs have at least 3 hours difference", () => {
    const baseDate = new Date("2026-04-10");
    const naverTime = generatePublishTime("naver", baseDate);
    const tistoryTime = generatePublishTime("tistory", baseDate, naverTime);
    const diffHours = Math.abs(tistoryTime.getHours() - naverTime.getHours());
    expect(diffHours).toBeGreaterThanOrEqual(3);
  });
});

describe("shouldPublishToday", () => {
  it("returns boolean", () => {
    const result = shouldPublishToday("weekday");
    expect(typeof result).toBe("boolean");
  });

  it("weekday has higher probability than weekend", () => {
    let weekdayCount = 0;
    let weekendCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (shouldPublishToday("weekday")) weekdayCount++;
      if (shouldPublishToday("weekend")) weekendCount++;
    }
    expect(weekdayCount).toBeGreaterThan(weekendCount);
  });
});
