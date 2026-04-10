export function shouldIncludeLink(
  platform: "naver" | "tistory",
  postCount: number,
  linkEnabled: boolean
): boolean {
  if (!linkEnabled) return false;

  if (platform === "naver") {
    if (postCount < 10) return false;
    return Math.random() < 0.2; // 20%
  }

  // tistory: 30~40%
  return Math.random() < 0.35;
}
