import fs from "fs";
import path from "path";

const SUBCATEGORY_MAP: Record<string, Record<string, string>> = {
  "화환": {
    "장례": "근조", "근조": "근조", "부고": "근조", "조문": "근조",
    "개업": "축하", "승진": "축하", "당선": "축하", "취임": "축하",
    "결혼": "결혼", "피로연": "결혼", "웨딩": "결혼",
  },
  "꽃다발": {
    "생일": "생일", "기념일": "생일",
    "프로포즈": "프로포즈", "고백": "프로포즈",
    "졸업": "졸업", "입학": "졸업",
  },
  "화분": {
    "개업": "개업", "이전": "개업",
    "공기정화": "공기정화", "사무실": "공기정화",
    "난": "난", "란": "난",
  },
};

export function categoryToFolder(category: string, keyword: string): string {
  const subMap = SUBCATEGORY_MAP[category];
  if (!subMap) return "일반";

  for (const [key, folder] of Object.entries(subMap)) {
    if (keyword.includes(key)) {
      return `${category}/${folder}`;
    }
  }

  const firstFolder = Object.values(subMap)[0];
  return firstFolder ? `${category}/${firstFolder}` : "일반";
}

export function selectImages(
  available: string[],
  recentlyUsed: string[],
  count = 3
): string[] {
  const usedSet = new Set(recentlyUsed);
  const eligible = available.filter((img) => !usedSet.has(img));
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getImagesForArticle(
  imageBaseDir: string,
  category: string,
  keyword: string,
  recentlyUsed: string[]
): string[] {
  const folder = categoryToFolder(category, keyword);
  const folderPath = path.join(imageBaseDir, folder);

  let files: string[] = [];
  try {
    files = fs.readdirSync(folderPath)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map((f) => path.join(folder, f));
  } catch {
    const fallbackPath = path.join(imageBaseDir, "일반");
    try {
      files = fs.readdirSync(fallbackPath)
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map((f) => path.join("일반", f));
    } catch {
      return [];
    }
  }

  return selectImages(files, recentlyUsed);
}
