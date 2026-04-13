import { callGemini } from "./gemini.js";
import { prisma } from "../db.js";
import { findDuplicates } from "./keyword-similarity.js";

const CATEGORIES = ["화환", "꽃다발", "화분", "꽃지식", "상황별"];

const GENERATE_PROMPT = `당신은 네이버 SEO 키워드 전문가입니다.
"꽃" 관련 블로그를 위한 롱테일 키워드를 생성하세요.

[이미 사용된 키워드 — 절대 겹치지 않게]
{used_keywords}

[우선 카테고리]
{priority_category}

[조건]
- 네이버에서 실제로 검색할 법한 자연스러운 한국어 키워드
- 검색량 300~1500 예상되는 롱테일 키워드
- 3~6어절 길이
- 위 사용된 키워드와 의미가 겹치지 않을 것
- 카테고리 표시 필수

[출력 형식 — JSON 배열로만 답하세요]
[
  {"keyword": "장례식 화환 당일배송 가능한 곳", "category": "화환", "searchVolume": 500},
  ...
]

30개를 생성하세요.`;

function getWeekOfMonth(): number {
  const now = new Date();
  return Math.ceil(now.getDate() / 7);
}

function getPriorityCategory(): string {
  const week = getWeekOfMonth();
  const rotation = ["화환", "꽃다발", "화분", "꽃지식,상황별"];
  return rotation[(week - 1) % rotation.length];
}

export interface GeneratedKeyword {
  keyword: string;
  category: string;
  searchVolume: number;
}

export async function generateKeywords(blogId: number): Promise<GeneratedKeyword[]> {
  // Get all used keywords
  const usedKeywords = await prisma.keyword.findMany({
    select: { keyword: true },
  });
  const usedList = usedKeywords.map((k) => k.keyword);

  const priorityCategory = getPriorityCategory();

  const prompt = GENERATE_PROMPT
    .replace("{used_keywords}", usedList.length > 0 ? usedList.join("\n") : "(없음)")
    .replace("{priority_category}", priorityCategory);

  const rawResponse = await callGemini(prompt, 8192);
  const responseText = rawResponse.replace(/```json\s*/g, "").replace(/```/g, "");

  // Extract JSON array from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let generated: GeneratedKeyword[];
  try {
    generated = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  // Filter duplicates
  const filtered = generated.filter((g) => !findDuplicates(g.keyword, usedList));

  // Save to DB
  const saved: GeneratedKeyword[] = [];
  for (const kw of filtered) {
    try {
      await prisma.keyword.create({
        data: {
          blogId,
          keyword: kw.keyword,
          category: kw.category,
          searchVolume: kw.searchVolume,
          difficulty: kw.searchVolume < 500 ? "low" : kw.searchVolume < 1000 ? "mid" : "high",
        },
      });
      saved.push(kw);
    } catch {
      // Duplicate keyword constraint — skip
    }
  }

  return saved;
}

export async function ensureKeywordsAvailable(blogId: number, minCount = 10): Promise<void> {
  const pendingCount = await prisma.keyword.count({
    where: { blogId, status: "pending" },
  });

  if (pendingCount < minCount) {
    await generateKeywords(blogId);
  }
}
