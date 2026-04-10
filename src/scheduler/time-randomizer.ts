function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function clampHour(hour: number): number {
  return Math.max(8, Math.min(22, Math.round(hour)));
}

export function generatePublishTime(
  platform: "naver" | "tistory",
  baseDate: Date,
  avoidTime?: Date
): Date {
  const result = new Date(baseDate);

  let hour: number;
  if (platform === "naver") {
    hour = Math.random() < 0.5
      ? gaussianRandom(10, 1.5)
      : gaussianRandom(20, 1.5);
  } else {
    hour = Math.random() < 0.5
      ? gaussianRandom(14, 2)
      : gaussianRandom(21, 1);
  }

  hour = clampHour(hour);

  if (avoidTime) {
    const avoidHour = avoidTime.getHours();
    while (Math.abs(hour - avoidHour) < 3) {
      hour = clampHour(hour + (hour < avoidHour ? -3 : 3));
    }
  }

  const minute = Math.floor(Math.random() * 60);
  result.setHours(hour, minute, 0, 0);
  return result;
}

export type DayType = "weekday" | "weekend" | "holiday";

export function shouldPublishToday(dayType: DayType): boolean {
  const probabilities: Record<DayType, number> = {
    weekday: 0.7,
    weekend: 0.5,
    holiday: 0.3,
  };
  return Math.random() < probabilities[dayType];
}

export function getDayType(date: Date): DayType {
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  return "weekday";
}
