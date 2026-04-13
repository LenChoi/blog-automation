import type { EditorCommand } from "../engine/formatter.js";
import { openclawChat, createSessionKey } from "./openclaw.js";

const BLOG_ID = "coolhot_";
const HINT = "모든 브라우저 액션에 timeoutMs: 120000 설정. screenshot으로 페이지 상태 확인(snapshot 대신). 임시저장 복원 팝업이 뜨면 '아니오' 클릭.";

export interface NaverPublishInput {
  commands: EditorCommand[];
  title: string;
  blogCategory?: string;
  hashtags?: string[];
}

export interface PublishResult {
  success: boolean;
  screenshotPath?: string;
  publishedUrl?: string;
  error?: string;
}

// 세션 키를 모듈 레벨에서 유지 — 한 번의 발행 전체에서 동일 세션 사용
let currentSession = "";

async function act(name: string, instruction: string): Promise<string> {
  console.log(`[Naver] ${name}...`);
  try {
    const result = await openclawChat(`${HINT}\n\n${instruction}`, currentSession);
    console.log(`[Naver] ${name} → ${result.slice(0, 150)}`);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Naver] ${name} 실패: ${msg.slice(0, 200)}`);
    return "";
  }
}

function extractImageUrls(commands: EditorCommand[]): string[] {
  return (commands || [])
    .filter((cmd) => cmd.type === "image" && cmd.path)
    .map((cmd) => cmd.path!);
}

/** 마크다운 서식 제거 (서식은 나중에 별도 적용) */
function stripMarkdown(text: string): string {
  return text
    .replace(/^###\s+/gm, "")
    .replace(/^##\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1");
}

/** 텍스트를 줄바꿈 기준으로 분할 */
function splitText(text: string, maxLen = 700): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < 200) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < 200) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

/** 본문을 이미지 마커 기준으로 분할 */
function splitContent(retouched: string): { type: "text" | "placeholder"; content: string }[] {
  const markers = ["[IMAGE_TOP]", "[IMAGE_MID]", "[IMAGE_BOTTOM]"];
  const result: { type: "text" | "placeholder"; content: string }[] = [];
  let content = retouched;
  let imgIdx = 1;

  for (const marker of markers) {
    const idx = content.indexOf(marker);
    if (idx !== -1) {
      const before = content.slice(0, idx).trim();
      if (before) result.push({ type: "text", content: before });
      result.push({ type: "placeholder", content: `[이미지${imgIdx} 자리]` });
      imgIdx++;
      content = content.slice(idx + marker.length);
    }
  }
  const remaining = content.trim();
  if (remaining) result.push({ type: "text", content: remaining });

  return result;
}

export async function publishToNaver(input: NaverPublishInput, retouched?: string): Promise<PublishResult> {
  const content = retouched || "";
  const imageUrls = extractImageUrls(input.commands);
  const hashtags = input.hashtags || [];

  // 발행 시작 시 세션 1회 생성
  currentSession = createSessionKey();
  console.log(`[Naver] 발행 시작: "${input.title}" (${content.length}자, 이미지 ${imageUrls.length}장, 세션: ${currentSession})`);

  // === 1. 페이지 열기 ===
  const r1 = await act("페이지 열기",
    `네이버 블로그 글쓰기 페이지를 열어줘. 주소: https://blog.naver.com/${BLOG_ID}/postwrite\n에디터가 완전히 로드될 때까지 기다려줘.`);
  if (!r1) return { success: false, error: "페이지 열기 실패" };

  // === 2. 제목 입력 ===
  await act("제목 입력",
    `제목 입력란을 클릭하고 "${input.title}" 를 입력해줘.`);

  // === 3. 제목 확인 ===
  await act("제목 확인",
    `screenshot으로 현재 상태를 보여줘. 제목이 잘 입력되었는지 확인해줘.`);

  // === 4. 카테고리 선택 ===
  if (input.blogCategory) {
    await act("카테고리 선택",
      `카테고리를 "${input.blogCategory}"로 변경해줘.`);

    await act("카테고리 확인",
      `screenshot으로 카테고리가 잘 선택되었는지 확인해줘.`);
  }

  // === 5. 본문 영역 클릭 ===
  await act("본문 진입",
    `본문 편집 영역을 클릭해서 커서를 위치시켜줘.`);

  // === 6. 본문 분할 입력 ===
  const parts = splitContent(content);

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];

    if (part.type === "placeholder") {
      await act(`본문: ${part.content}`,
        `현재 커서 위치에서 "${part.content}" 라고 입력하고 엔터를 쳐줘.`);
    } else {
      const plain = stripMarkdown(part.content);
      const chunks = splitText(plain);

      for (let i = 0; i < chunks.length; i++) {
        await act(`본문: 텍스트 (파트${p + 1}, ${i + 1}/${chunks.length})`,
          `현재 커서 위치에서 이어서 아래 텍스트를 입력해줘:\n\n${chunks[i]}`);
      }
    }

    // 매 파트 후 screenshot 확인
    await act(`본문: 파트${p + 1} 확인`,
      `screenshot으로 지금까지 입력된 본문 상태를 확인해줘.`);
  }

  // === 7. 이미지 삽입 ===
  for (let i = 0; i < imageUrls.length; i++) {
    const placeholder = `[이미지${i + 1} 자리]`;

    await act(`이미지${i + 1}: 플레이스홀더 삭제`,
      `본문에서 "${placeholder}" 텍스트를 찾아서 선택(드래그)한 뒤 삭제해줘.`);

    await act(`이미지${i + 1}: 삽입`,
      `현재 커서 위치에 에디터의 사진 삽입 기능을 사용해서 이미지를 넣어줘.\n이미지 URL: ${imageUrls[i]}`);

    await act(`이미지${i + 1}: 확인`,
      `screenshot으로 이미지가 잘 삽입되었는지 확인해줘.`);
  }

  // === 8. 소제목 서식 적용 (세로바 스타일) ===
  const headings: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.trim().match(/^##\s+(.+)$/);
    if (m) headings.push(m[1]);
  }

  for (const heading of headings) {
    await act(`소제목 서식: "${heading.slice(0, 20)}"`,
      `본문에서 "${heading}" 텍스트를 찾아서 드래그로 선택한 뒤, 네이버 에디터의 "제목" 서식을 적용해줘. 글자 크기를 24px(크게), 볼드를 적용해줘.`);
  }

  // === 9. 하위 제목 서식 (### → 초록색 볼드) ===
  const subHeadings: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.trim().match(/^###\s+(.+)$/);
    if (m) subHeadings.push(m[1]);
  }

  for (const sub of subHeadings) {
    await act(`하위 제목 서식: "${sub.slice(0, 20)}"`,
      `본문에서 "${sub}" 텍스트를 찾아서 드래그로 선택한 뒤, 볼드 + 초록색(#2DB400) 서식을 적용해줘.`);
  }

  // === 10. 구분선 삽입 ===
  // 본문에 "---"가 있으면 해당 위치에 구분선 컴포넌트 삽입
  const hasSeparators = content.includes("\n---\n");
  if (hasSeparators) {
    await act("구분선 삽입",
      `본문에서 "---" 텍스트를 찾아서 삭제하고, 그 위치에 네이버 에디터의 구분선(가로선) 컴포넌트를 삽입해줘. "---"가 여러 개 있으면 모두 처리해줘.`);
  }

  // === 11. 볼드 키워드 서식 ===
  const boldKeywords: string[] = [];
  for (const m of content.matchAll(/\*\*(.+?)\*\*/g)) {
    if (!boldKeywords.includes(m[1])) {
      boldKeywords.push(m[1]);
    }
  }

  for (const kw of boldKeywords.slice(0, 5)) {
    await act(`키워드 서식: "${kw.slice(0, 20)}"`,
      `본문에서 "${kw}" 텍스트를 찾아서 드래그로 선택한 뒤, 볼드 + 초록색(#2DB400)을 적용해줘.`);
  }

  // === 12. 서식 확인 ===
  await act("서식 확인",
    `screenshot으로 소제목, 하위제목, 구분선, 키워드 서식이 잘 적용되었는지 확인해줘.`);

  // === 11. 해시태그 ===
  if (hashtags.length > 0) {
    await act("해시태그 입력",
      `태그 입력 영역에 다음 태그를 하나씩 입력해줘: ${hashtags.join(", ")}`);

    await act("해시태그 확인",
      `screenshot으로 해시태그가 잘 입력되었는지 확인해줘.`);
  }

  // === 12. 최종 확인 ===
  await act("최종 확인",
    `screenshot으로 전체 글을 확인해줘. 제목, 카테고리, 본문, 이미지, 서식, 해시태그 모두 확인.`);

  // === 13. 발행 ===
  const publishResult = await act("발행",
    `"발행" 버튼을 클릭해서 공개 발행해줘.`);

  const confirmResult = await act("발행 URL 확인",
    `발행이 완료되었는지 확인해줘. 글 URL을 알려줘.`);

  const allResults = publishResult + " " + confirmResult;
  const urlMatch = allResults.match(/https?:\/\/blog\.naver\.com\/[^\s)]+/);

  return {
    success: !!urlMatch,
    publishedUrl: urlMatch ? urlMatch[0] : undefined,
    error: urlMatch ? undefined : "발행 URL을 찾지 못함",
  };
}

export async function confirmPublishNaver(): Promise<PublishResult> {
  return { success: true };
}
