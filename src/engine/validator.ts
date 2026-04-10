import Anthropic from "@anthropic-ai/sdk";

const BANNED_PHRASES = [
  "에 대해 알아보겠습니다",
  "에 대해 알아볼게요",
  "하는 것이 중요합니다",
  "마지막으로 정리하자면",
  "참고하시기 바랍니다",
  "도움이 되셨으면 좋겠습니다",
  "도움이 되었으면 좋겠습니다",
  "살펴보도록 하겠습니다",
  "알아보도록 하겠습니다",
];

const AI_SMELL_WORDS = [
  "다양한",
  "효과적인",
  "중요한 역할",
  "핵심적인",
  "필수적인",
  "첫째,",
  "둘째,",
  "셋째,",
  "결론적으로",
  "종합적으로",
];

export function checkBannedPhrases(text: string): string[] {
  const found: string[] = [];
  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase)) found.push(phrase);
  }
  for (const word of AI_SMELL_WORDS) {
    if (text.includes(word)) found.push(word);
  }
  return found;
}

export function checkLength(text: string, min = 1500, max = 2500): boolean {
  const stripped = text
    .replace(/\[IMAGE_(TOP|MID|BOTTOM)\]/g, "")
    .replace(/^#+\s+.+$/gm, "")
    .replace(/\n/g, "")
    .trim();
  return stripped.length >= min && stripped.length <= max;
}

export function checkKeywordDensity(text: string, keyword: string): number {
  const stripped = text.replace(/\[IMAGE_(TOP|MID|BOTTOM)\]/g, "").replace(/^#+\s+.+$/gm, "");
  const keywordCount = stripped.split(keyword).length - 1;
  const totalLength = stripped.length;
  if (totalLength === 0) return 0;
  return (keywordCount * keyword.length) / totalLength * 100;
}

export interface ValidationResult {
  pass: boolean;
  aiScore: number;
  bannedPhrases: string[];
  lengthOk: boolean;
  densityOk: boolean;
  density: number;
}

export async function validateContent(
  content: string,
  keyword: string
): Promise<ValidationResult> {
  const bannedPhrases = checkBannedPhrases(content);
  const lengthOk = checkLength(content);
  const density = checkKeywordDensity(content, keyword);
  const densityOk = density >= 1 && density <= 5;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `아래 블로그 글의 "AI가 쓴 느낌" 점수를 0~100으로 평가하세요.
0 = 완전히 사람이 쓴 글, 100 = 완전히 AI가 쓴 글.

숫자만 답하세요. 예: 25

---
${content}`,
    }],
  });

  const scoreText = message.content[0].type === "text" ? message.content[0].text : "50";
  const aiScore = parseInt(scoreText.replace(/[^0-9]/g, ""), 10) || 50;

  const pass = aiScore < 30 && bannedPhrases.length === 0 && lengthOk && densityOk;

  return { pass, aiScore, bannedPhrases, lengthOk, densityOk, density };
}
