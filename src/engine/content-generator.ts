import { callGemini } from "./gemini.js";

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

[정보 정확성 — 매우 중요]
- 가격, 수량, 크기, 배송 시간 등 수치 정보는 반드시 2024~2025년 기준 현실에 맞는 정확한 정보를 작성하세요
- 모르는 정보는 추측하지 말고, "업체마다 다를 수 있어요" 같이 솔직하게 표현하세요
- 가격 범위를 쓸 때는 현재 시장에서 실제로 통용되는 가격대를 반영하세요
- 잘못된 정보는 블로그 신뢰도를 떨어뜨리므로, 확실하지 않은 내용은 빼세요

[작성 조건]
- 제목: 25자 이하, 키워드를 맨 앞에 배치. 경험이 담긴 느낌 (예: "~해보니", "~정리", "~알게 된 것들")
- 글 길이: {length}자 내외
- 이미지 위치 마커를 본문에 포함: [IMAGE_TOP], [IMAGE_MID], [IMAGE_BOTTOM]
  - [IMAGE_TOP]: 도입부 인사/소개 문단이 끝난 뒤 (첫 번째 소제목 직전)
  - [IMAGE_MID]: 중간 (핵심 정보 근처)
  - [IMAGE_BOTTOM]: 마무리 전
- 자연스러운 블로그 말투 (해요체)
- 경험 기반 느낌 포함
- 단순 정보 나열 금지 (스토리텔링으로)
- 반복 표현 금지
{link_instruction}

[서식 규칙 — 반드시 지켜주세요]
- 소제목: "## 🌸 소제목 텍스트" 형식 (이모지 + 소제목)
- 소제목은 2~3개
- 강조 키워드: **강조할 텍스트** (볼드)
- 핵심 정보 요약은 > 인용구로 작성
- 분류/소분류가 있으면 "▶ 분류명" 형식
- 목록은 "• 항목" 형식
- 문단 사이에 빈 줄 1개

[절대 금지]
- "오늘은 ~에 대해 알아보겠습니다"
- "~하는 것이 중요합니다"
- "마지막으로 정리하자면"
- "참고하시기 바랍니다"
- "도움이 되셨으면 좋겠습니다"
- "다양한", "효과적인" 같은 AI 상투어
- 확인되지 않은 가격이나 수치를 단정적으로 쓰는 것`;

const REVIEW_PROMPT = `당신은 {persona}입니다.
"{keyword}"에 대한 일상 경험이 녹아든 정보형 블로그 글을 작성하세요.

[글 유형: 경험 기반 정보형]
- 정보 전달이 핵심이되, 자신의 경험을 자연스럽게 섞기
- 감정과 상황을 곁들여 생동감 있게
- 구체적인 디테일 (시간, 장소, 가격, 감정)

[정보 정확성 — 매우 중요]
- 가격, 수량, 크기, 배송 시간 등 수치 정보는 반드시 2024~2025년 기준 현실에 맞는 정확한 정보를 작성하세요
- 모르는 정보는 추측하지 말고, "업체마다 다를 수 있어요" 같이 솔직하게 표현하세요
- 가격 범위를 쓸 때는 현재 시장에서 실제로 통용되는 가격대를 반영하세요
- 잘못된 정보는 블로그 신뢰도를 떨어뜨리므로, 확실하지 않은 내용은 빼세요

[작성 조건]
- 제목: 25자 이하, 키워드를 맨 앞에 배치. 정보+경험 느낌 (예: "~알아보고 직접 해봤어요", "~정리해봤어요", "~추천 가이드")
- 제목에 "후기", "리뷰", "솔직 후기", "배송후기" 같은 직접적인 후기 표현 절대 금지
- 특정 업체/브랜드 이름을 제목에 넣지 마세요
- 글 길이: {length}자 내외
- 이미지 위치 마커를 본문에 포함: [IMAGE_TOP], [IMAGE_MID], [IMAGE_BOTTOM]
  - [IMAGE_TOP]: 도입부 인사/소개 문단이 끝난 뒤 (첫 번째 소제목 직전)
  - [IMAGE_MID]: 중간 (핵심 정보 근처)
  - [IMAGE_BOTTOM]: 마무리 전
- 반말+해요체 혼합 ("~거든요", "~더라고요", "~했어요")
- 혼잣말 삽입 ("근데 이게 진짜...", "솔직히 말하면...")
- 구체적 디테일: 시간("지난 주에"), 장소("강남역 근처"), 감정("진짜 고민 많이 했는데")
{link_instruction}

[서식 규칙 — 반드시 지켜주세요]
- 소제목: "## 🌸 소제목 텍스트" 형식 (이모지 + 소제목)
- 소제목은 2~3개
- 강조 키워드: **강조할 텍스트** (볼드)
- 핵심 정보 요약은 > 인용구로 작성
- 분류/소분류가 있으면 "▶ 분류명" 형식
- 목록은 "• 항목" 형식
- 문단 사이에 빈 줄 1개

[절대 금지]
- "오늘은 ~에 대해 알아보겠습니다"
- "~하는 것이 중요합니다"
- "마지막으로 정리하자면"
- "참고하시기 바랍니다"
- "도움이 되셨으면 좋겠습니다"
- "다양한", "효과적인" 같은 AI 상투어
- 리스트형 나열 (첫째, 둘째, 셋째)
- 제목에 "후기", "리뷰" 단어 사용
- 특정 브랜드/업체의 배송후기, 이용후기 형태의 글
- 확인되지 않은 가격이나 수치를 단정적으로 쓰는 것`;

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
  const prompt = buildPrompt(input);
  const content = await callGemini(prompt);
  const title = extractTitle(content);

  return { title, content };
}
