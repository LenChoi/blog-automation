import Anthropic from "@anthropic-ai/sdk";

export interface DraftInput {
  keyword: string;
  blogType: "seo" | "review";
  persona: string;
  includeLink: boolean;
  targetUrl: string;
  brandName: string;
  length: number;
}

export interface DraftResult {
  title: string;
  content: string;
}

const SEO_PROMPT = `당신은 {persona}입니다.
"{keyword}"에 대한 네이버 블로그 글을 작성하세요.

[글 유형: 정보형 블로그]
- 검색 유입을 위한 정보 중심 글
- 자신의 경험을 약간 섞되, 정보 제공이 핵심
- 독자가 실제로 도움이 되는 내용

[작성 조건]
- 제목: 25자 이하, 키워드를 맨 앞에 배치. 경험이 담긴 느낌 (예: "~해보니", "~정리", "~알게 된 것들")
- 글 길이: {length}자 내외
- 이미지 위치 마커를 본문에 포함: [IMAGE_TOP], [IMAGE_MID], [IMAGE_BOTTOM]
  - [IMAGE_TOP]: 글 시작 부분 (인사 후)
  - [IMAGE_MID]: 중간 (핵심 정보 근처)
  - [IMAGE_BOTTOM]: 마무리 전
- 소제목 2~3개 포함
- 자연스러운 블로그 말투 (해요체)
- 경험 기반 느낌 포함
- 단순 정보 나열 금지 (스토리텔링으로)
- 반복 표현 금지
{link_instruction}

[절대 금지]
- "오늘은 ~에 대해 알아보겠습니다"
- "~하는 것이 중요합니다"
- "마지막으로 정리하자면"
- "참고하시기 바랍니다"
- "도움이 되셨으면 좋겠습니다"
- "다양한", "효과적인" 같은 AI 상투어`;

const REVIEW_PROMPT = `당신은 {persona}입니다.
"{keyword}"에 대한 경험담/후기 블로그 글을 작성하세요.

[글 유형: 후기/체험형]
- 실제 경험한 것처럼 생생하게 작성
- 감정과 상황 중심
- 구체적인 디테일 (시간, 장소, 가격, 감정)

[작성 조건]
- 제목: 25자 이하, 키워드를 맨 앞에 배치. 후기 느낌 (예: "~솔직 후기", "~해본 경험", "~추천")
- 글 길이: {length}자 내외
- 이미지 위치 마커를 본문에 포함: [IMAGE_TOP], [IMAGE_MID], [IMAGE_BOTTOM]
- 소제목 2~3개 포함
- 반말+해요체 혼합 ("~거든요", "~더라고요", "~했어요")
- 혼잣말 삽입 ("근데 이게 진짜...", "솔직히 말하면...")
- 구체적 디테일: 시간("지난 주에"), 장소("강남역 근처"), 감정("진짜 고민 많이 했는데")
{link_instruction}

[절대 금지]
- "오늘은 ~에 대해 알아보겠습니다"
- "~하는 것이 중요합니다"
- "마지막으로 정리하자면"
- "참고하시기 바랍니다"
- "도움이 되셨으면 좋겠습니다"
- "다양한", "효과적인" 같은 AI 상투어
- 리스트형 나열 (첫째, 둘째, 셋째)`;

function buildPrompt(input: DraftInput): string {
  const template = input.blogType === "seo" ? SEO_PROMPT : REVIEW_PROMPT;

  const linkInstruction = input.includeLink
    ? `- 글 중간에 자연스럽게 "${input.brandName}"을 1회 언급하고, 링크(${input.targetUrl})를 삽입하세요. 광고처럼 보이면 안 됩니다.`
    : "- 브랜드 언급이나 외부 링크를 포함하지 마세요.";

  return template
    .replace("{persona}", input.persona)
    .replace("{keyword}", input.keyword)
    .replace("{length}", String(input.length))
    .replace("{link_instruction}", linkInstruction);
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
  return firstLine.slice(0, 25);
}

export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const client = new Anthropic();
  const prompt = buildPrompt(input);

  const message = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  const title = extractTitle(content);

  return { title, content };
}
