import { describe, it, expect } from "vitest";
import { categoryToFolder, selectImages } from "../engine/image-matcher";

describe("categoryToFolder", () => {
  it("maps 화환 category to correct folder", () => {
    expect(categoryToFolder("화환", "장례식 화환 가격")).toBe("화환/근조");
  });

  it("maps 꽃다발 category", () => {
    expect(categoryToFolder("꽃다발", "생일 꽃다발 추천")).toBe("꽃다발/생일");
  });

  it("falls back to 일반 for unknown", () => {
    expect(categoryToFolder("기타", "알수없는 키워드")).toBe("일반");
  });
});

describe("selectImages", () => {
  const available = [
    "img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg", "img5.jpg",
    "img6.jpg", "img7.jpg", "img8.jpg",
  ];
  const recentlyUsed = ["img1.jpg", "img2.jpg"];

  it("returns exactly 3 images", () => {
    const result = selectImages(available, recentlyUsed);
    expect(result).toHaveLength(3);
  });

  it("excludes recently used images", () => {
    const result = selectImages(available, recentlyUsed);
    result.forEach((img) => {
      expect(recentlyUsed).not.toContain(img);
    });
  });

  it("returns unique images", () => {
    const result = selectImages(available, recentlyUsed);
    expect(new Set(result).size).toBe(3);
  });
});
