import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

export interface ReviewResult {
  pass: boolean;
  score: number;
  issues: string[];
}

const REVIEW_PROMPT = `이 네이버/티스토리 블로그 미리보기 스크린샷을 검수하세요.

다음 항목을 체크하세요:
1. 소제목 색상/크기가 정상 적용됐는가 (초록색, 크게)
2. 형광펜 강조가 정상 적용됐는가
3. 이미지가 3장 모두 보이는가
4. 줄바꿈/여백이 자연스러운가 (답답하지 않은가)
5. 이모지가 깨지지 않았는가
6. 인용구 박스가 정상인가
7. 글이 잘려있거나 레이아웃이 깨진 곳이 있는가
8. 해시태그가 하단에 정상 표시되는가

JSON으로만 답하세요:
{
  "score": 0~100 (높을수록 좋음),
  "issues": ["문제1", "문제2"] (없으면 빈 배열)
}`;

export async function reviewScreenshot(screenshotPath: string): Promise<ReviewResult> {
  // Check if screenshot exists
  if (!fs.existsSync(screenshotPath)) {
    return { pass: false, score: 0, issues: ["Screenshot file not found"] };
  }

  const imageData = fs.readFileSync(screenshotPath);
  const base64 = imageData.toString("base64");
  const mediaType = screenshotPath.endsWith(".png") ? "image/png" as const : "image/jpeg" as const;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        { type: "text", text: REVIEW_PROMPT },
      ],
    }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : '{"score":0,"issues":["Failed to parse"]}';

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    const score = parsed.score || 0;
    const issues = parsed.issues || [];

    return {
      pass: score >= 90,
      score,
      issues,
    };
  } catch {
    return { pass: false, score: 0, issues: ["Failed to parse review response"] };
  }
}
