import Anthropic from "@anthropic-ai/sdk";

export interface RetouchInput {
  draft: string;
  blogType: "seo" | "review";
  persona: string;
  keyword: string;
}

const RETOUCH_PROMPT = `당신은 {persona}입니다.
아래 초안을 당신의 블로그에 올릴 글로 자연스럽게 다시 작성하세요.

[리터치 규칙]
1. AI가 쓴 느낌을 완전히 제거하세요
   - "~입니다", "~합니다" 반복 금지
   - "첫째, 둘째, 셋째" 같은 기계적 나열 금지
   - "다양한", "효과적인", "중요한" 같은 AI 상투어 제거

2. 네이버 블로그 말투로 바꾸세요
   - "~거든요", "~더라고요", "~했어요" 혼합 사용
   - 중간에 혼잣말 ("근데 이게 진짜 예쁜 게...") 삽입
   - 문장 길이를 불규칙하게 (짧은 문장 2~3개 + 긴 문장 1개)

3. 경험담을 구체적으로 보강하세요
   - 시간: "지난 주에", "작년 겨울에"
   - 장소: "강남역 근처", "회사 앞"
   - 감정: "진짜 고민 많이 했는데", "보자마자 마음에 들었어요"
   - 디테일: 가격대, 배송 시간, 포장 상태 등

4. 글 구조를 블로그답게 바꾸세요
   - 도입: 일상적인 상황으로 시작 (절대 키워드 설명으로 시작 X)
   - 중간: 자연스럽게 정보 전달
   - 마무리: "~해보세요!" 같은 권유형 (요약 정리 X)

5. 아래 표현은 절대 사용 금지
   - "오늘은 ~에 대해 알아보겠습니다"
   - "~하는 것이 중요합니다"
   - "마지막으로 정리하자면"
   - "참고하시기 바랍니다"
   - "도움이 되셨으면 좋겠습니다"

6. [IMAGE_TOP], [IMAGE_MID], [IMAGE_BOTTOM] 마커는 반드시 유지하세요.

7. 제목도 다시 작성하세요 (25자 이하, 키워드 "{keyword}" 맨 앞).

[초안]
{draft}`;

export async function retouchContent(input: RetouchInput): Promise<string> {
  const client = new Anthropic();
  const prompt = RETOUCH_PROMPT
    .replace("{persona}", input.persona)
    .replace("{keyword}", input.keyword)
    .replace("{draft}", input.draft);

  const message = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
