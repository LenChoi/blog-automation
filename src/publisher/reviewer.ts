import fs from "fs";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

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
  if (!fs.existsSync(screenshotPath)) {
    return { pass: false, score: 0, issues: ["Screenshot file not found"] };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { pass: false, score: 0, issues: ["GEMINI_API_KEY is not set"] };
  }

  const imageData = fs.readFileSync(screenshotPath);
  const base64 = imageData.toString("base64");
  const mimeType = screenshotPath.endsWith(".png") ? "image/png" : "image/jpeg";

  const requestBody = {
    contents: [{
      parts: [
        {
          inlineData: { mimeType, data: base64 },
        },
        { text: REVIEW_PROMPT },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 500,
    },
  };

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    return { pass: false, score: 0, issues: [`Gemini API error: ${response.status}`] };
  }

  const data = await response.json();
  const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"score":0,"issues":["Empty response"]}';

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
