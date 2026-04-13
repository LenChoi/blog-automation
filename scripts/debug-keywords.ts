import { callGemini } from "../src/engine/gemini";
import { prisma } from "../src/db";
import { findDuplicates } from "../src/engine/keyword-similarity";

async function main() {
  const usedKeywords = await prisma.keyword.findMany({ select: { keyword: true } });
  const usedList = usedKeywords.map((k) => k.keyword);
  console.log("Used keywords:", usedList.length);

  const prompt = `당신은 네이버 SEO 키워드 전문가입니다.
"꽃" 관련 블로그를 위한 롱테일 키워드를 생성하세요.

[이미 사용된 키워드 — 절대 겹치지 않게]
${usedList.join("\n")}

[우선 카테고리]
꽃다발

[조건]
- 네이버에서 실제로 검색할 법한 자연스러운 한국어 키워드
- 검색량 300~1500 예상되는 롱테일 키워드
- 3~6어절 길이
- 위 사용된 키워드와 의미가 겹치지 않을 것
- 카테고리 표시 필수

[출력 형식 — JSON 배열로만 답하세요]
[
  {"keyword": "장례식 화환 당일배송 가능한 곳", "category": "화환", "searchVolume": 500},
]

30개를 생성하세요.`;

  const rawResponse = await callGemini(prompt);
  console.log("Raw response (first 500):", rawResponse.slice(0, 500));

  const responseText = rawResponse.replace(/```json\s*/g, "").replace(/```/g, "");
  console.log("Cleaned response (first 300):", responseText.slice(0, 300));

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  console.log("JSON match found:", !!jsonMatch);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("Parsed count:", parsed.length);

      let dupCount = 0;
      const filtered = parsed.filter((g: any) => {
        const isDup = findDuplicates(g.keyword, usedList);
        if (isDup) {
          dupCount++;
          console.log("DUP:", g.keyword);
        }
        return !isDup;
      });
      console.log("Duplicates:", dupCount, "Remaining:", filtered.length);
    } catch (e: any) {
      console.log("JSON parse error:", e.message);
      console.log("Raw match (first 300):", jsonMatch[0].slice(0, 300));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
