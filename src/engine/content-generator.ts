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

const PROMPT = `당신은 {persona}입니다.
"{keyword}"에 대한 네이버 블로그 글을 작성하세요.

⚠️ 가장 중요한 규칙: 글 전체 길이는 반드시 2500~3000자입니다.
- 2500자 미만 금지, 3000자 초과도 금지
- 3500자가 넘으면 절대 안 됨 (재생성됨)
- 소제목 정확히 3개 (대표주제 포함)
- 각 소제목 아래 본문은 200~350자로 간결하게
- 하위항목(### 이모지)은 필요한 경우에만 넣기 (항상 넣지 않음)
- 불필요한 반복, 사족 금지 — 핵심 정보만 간결하게

{type_instruction}

[제목 규칙]
- "# 제목" 형식, 25자 이하
- 키워드 "{keyword}"를 제목 맨 앞에 배치
- 제목은 순수하게 키워드 + 정보 느낌으로만 (예: "근조화환 문구, 처음이라 막막할 때 보세요")
- 제목에 페르소나 이름/닉네임/가게 이름/경력 표현 절대 금지 (예: "플로라", "꽃친", "~년차 꽃집 언니", "~가 알려주는", "~의 꿀팁")
- 제목에 인사말, 감탄사 금지

[인트로 규칙]
- # 제목 바로 아래, 첫 ## 소제목 전까지
- 3~5줄, 한 줄에 한 문장만 (20~40자)
- 경험 기반 도입부, 일상적인 상황으로 시작
- 키워드를 첫 2~3문장 안에 자연스럽게 포함
- 예시:
  얼마 전 직장 동료의 부친상 소식을 듣고 급하게 근조화환을 보내야 했다.
  그런데 막상 주문하려니 문구는 뭘 써야 하는지 처음이라 하나도 모르겠더라.
  꽃집에 전화해서 하나하나 물어보면서 알게 된 것들을 정리해 본다.

[글 구조 — 반드시 이 순서로 작성]
1. # 제목
2. 인트로 (3~5줄)
3. ## 대표주제 (글 전체의 메인 주제, 제목과 유사)
4. 대표주제 설명 본문 (3~5줄)
5. ## 소제목1
   ### 💡 하위항목1 (이모지 + 분류명, 반드시 이모지 포함)
   • 항목1
   • 항목2
   • 항목3
   ### 💒 하위항목2
   • 항목1
   • 항목2
   ### 🪷 하위항목3
   • 항목1
   • 항목2
   ---
6. ## 소제목2
   ### 🌹 하위항목1
   • 항목1
   • 항목2
   ### 🌷 하위항목2
   • 항목1
   ---
7. ## 마지막 소제목
   본문 또는 ### 하위항목들
   (--- 없음)
8. 마무리 (글 전체를 정리하는 1~2줄)

[중요 — 소제목 안의 구조]
- 각 소제목(##) 안에는 반드시 2~3개의 ### 하위항목을 만드세요
- 각 하위항목(###)은 이모지로 시작 (예: "### 💡 무교/종교 무관", "### 🌹 장미 추천")
- 각 하위항목 아래에 "• 항목" 형식의 목록 2~3개
- 단순 본문보다는 하위항목 + 목록 구조로 정리

[글 구조 필수 사항]
- 소제목(##)은 정확히 3개 (대표주제 포함)
- 각 소제목의 본문은 200~350자로 간결하게
- 하위항목(###)은 선택 사항 — 필요 없으면 넣지 마세요
- 소제목 내용이 끝나면 구분선 "---" 삽입 (마지막 소제목 제외)
- 마지막에 반드시 마무리 문장 1~2줄
- 이미지 마커: [IMAGE_MID], [IMAGE_BOTTOM] 2개만 소제목 마지막에 배치 ([IMAGE_TOP] 사용 금지!)

[말투 & 스타일]
- AI가 쓴 느낌을 완전히 제거
- "~입니다", "~합니다" 반복 금지
- 네이버 블로그 말투: "~거든요", "~더라고요", "~했어요" 혼합
- 혼잣말 삽입: "근데 이게 진짜...", "솔직히 말하면..."
- 문장 길이를 불규칙하게 (짧은 문장 2~3개 + 긴 문장 1개)
- 경험담을 구체적으로: 시간("지난 주에"), 장소("회사 앞"), 감정("진짜 고민 많이 했는데")

[네이버 블로그 SEO 최적화]
- 키워드 "{keyword}"를 제목, 인트로, 대표주제(첫 ##), 본문에 자연스럽게 3~5회 배치
- 소제목(##)에도 키워드를 1~2개 포함
- 키워드를 억지로 끼워넣지 말고 문맥에 맞게 자연스럽게 녹여주세요

[서식 규칙]
- 소제목: "## 소제목 텍스트" (번호 금지, 이모지 금지!)
- 하위항목: "### 이모지 제목" (이모지는 ###에만! 예: "### ⏰ 배송 시간은 여유 있게!")
- 구분선: "---" (소제목 사이, 마지막 제외)
- 강조: **강조할 텍스트**
- 목록: "• 항목"
- 문단 사이 빈 줄 1개

[정보 정확성]
- 가격, 수량 등 수치는 2024~2025년 기준 정확한 정보만
- 모르는 정보는 "업체마다 다를 수 있어요" 같이 솔직하게
- 확실하지 않은 내용은 빼기

[절대 금지]
- "오늘은 ~에 대해 알아보겠습니다", "~하는 것이 중요합니다"
- "마지막으로 정리하자면", "참고하시기 바랍니다", "도움이 되셨으면 좋겠습니다"
- "다양한", "효과적인" 같은 AI 상투어
- "안녕하세요", "반갑습니다" 같은 인사말
- 제목/소제목/본문에 페르소나 이름/닉네임/가게 이름 (플로라, 꽃친, ~'s 픽)
- 제목에 "~년차", "~가 알려주는", "~의 꿀팁" 같은 경력/페르소나 표현
- 소제목에 번호 (1. 2. 3.)
- 본문에 "1. ", "2. " 번호 매기기 — 대신 "• " 또는 이모지 사용
- [IMAGE_TOP] 사용
- "첫째, 둘째, 셋째" 리스트형 나열

{link_instruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 마지막 최종 확인 ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
글을 모두 작성한 후, 전체 글자수를 반드시 확인하세요.
- 반드시 2500~3000자 사이로 작성하세요.
- 3000자를 초과하면 안 됩니다. 3500자 넘으면 재생성됩니다.
- 2500자 미만도 안 됩니다.
- 소제목은 정확히 3개 (대표주제 포함).
- 각 소제목 본문은 200~350자.
- 하위항목(###)은 선택 사항 — 꼭 필요할 때만 넣으세요.
- 불필요한 반복, 중복 설명, 사족을 모두 제거하세요.

출력 전 한 번 더 글자수를 확인하고, 2500~3000자 범위를 지켜주세요.`;

const SEO_TYPE = `[글 유형: 정보형 블로그]
- 검색 유입을 위한 정보 중심 글
- 자신의 경험을 약간 섞되, 정보 제공이 핵심
- 독자가 실제로 도움이 되는 내용
- 자연스러운 블로그 말투 (해요체)
- 단순 정보 나열 금지 (스토리텔링으로)`;

const REVIEW_TYPE = `[글 유형: 경험 기반 정보형]
- 정보 전달이 핵심이되, 자신의 경험을 자연스럽게 섞기
- 감정과 상황을 곁들여 생동감 있게
- 반말+해요체 혼합 ("~거든요", "~더라고요", "~했어요")
- 혼잣말 삽입 ("근데 이게 진짜...", "솔직히 말하면...")
- 구체적 디테일: 시간("지난 주에"), 장소, 감정
- 제목에 "후기", "리뷰" 표현 절대 금지
- 특정 업체/브랜드 이름을 제목에 넣지 마세요
- 리스트형 나열 금지, 배송후기/이용후기 형태 금지`;

function buildPrompt(input: DraftInput): string {
  const typeInstruction = input.blogType === "seo" ? SEO_TYPE : REVIEW_TYPE;

  const linkInstruction = input.includeLink
    ? `- 글 중간에 자연스럽게 "${input.brandName}"을 1회 언급하고, 링크(${input.targetUrl})를 삽입하세요. 광고처럼 보이면 안 됩니다.`
    : "- 브랜드 언급이나 외부 링크를 포함하지 마세요.";

  return PROMPT
    .replace(/{persona}/g, input.persona)
    .replace(/{keyword}/g, input.keyword)
    .replace("{length}", String(input.length))
    .replace("{type_instruction}", typeInstruction)
    .replace("{link_instruction}", linkInstruction);
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
  return firstLine;
}

const MIN_LENGTH = 2000;
const MAX_LENGTH = 3500;
const MAX_RETRIES = 2;

export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const prompt = buildPrompt(input);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const content = await callGemini(prompt, 8192);
    const title = extractTitle(content);

    if (content.length >= MIN_LENGTH && content.length <= MAX_LENGTH) {
      console.log(`[Draft] ${content.length}자 생성 (attempt ${attempt}) ✓`);
      return { title, content };
    }

    if (content.length < MIN_LENGTH) {
      console.warn(`[Draft] ${content.length}자 — 너무 짧음 (최소 ${MIN_LENGTH}자). 재시도...`);
    } else {
      console.warn(`[Draft] ${content.length}자 — 너무 김 (최대 ${MAX_LENGTH}자). 재시도...`);
    }
  }

  // 재시도 소진 시 마지막 결과 반환
  const content = await callGemini(prompt, 8192);
  const title = extractTitle(content);
  console.warn(`[Draft] 최종 ${content.length}자 (재시도 소진)`);
  return { title, content };
}
