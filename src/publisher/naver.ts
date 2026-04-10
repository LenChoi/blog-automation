import type { EditorCommand } from "../engine/formatter.js";
import { openclawChat } from "./openclaw.js";

const BLOG_ID = "coolhot_";

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

function extractContent(commands: EditorCommand[]): {
  paragraphs: string[];
  headings: { text: string; afterParagraph: number }[];
  images: { url: string; afterParagraph: number }[];
  hashtags: string[];
} {
  const paragraphs: string[] = [];
  const headings: { text: string; afterParagraph: number }[] = [];
  const images: { url: string; afterParagraph: number }[] = [];
  const hashtags: string[] = [];
  let currentParagraph = "";

  for (const cmd of commands) {
    switch (cmd.type) {
      case "heading":
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        headings.push({ text: cmd.text || "", afterParagraph: paragraphs.length });
        break;
      case "text":
        currentParagraph += cmd.content || "";
        break;
      case "highlight":
        currentParagraph += cmd.text || "";
        break;
      case "newline":
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        break;
      case "image":
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        if (cmd.path) images.push({ url: cmd.path, afterParagraph: paragraphs.length });
        break;
      case "quote":
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        paragraphs.push(`[인용] ${cmd.text}`);
        break;
      case "hashtags":
        if (cmd.tags) hashtags.push(...cmd.tags);
        break;
    }
  }
  if (currentParagraph.trim()) paragraphs.push(currentParagraph.trim());

  return { paragraphs, headings, images, hashtags };
}

async function step(description: string, prompt: string): Promise<boolean> {
  console.log(`[Naver] ${description}...`);
  try {
    const result = await openclawChat(prompt, 300000); // 5분 타임아웃 per step
    console.log(`[Naver] ${description} → ${result.slice(0, 100)}`);
    return true;
  } catch (error) {
    console.error(`[Naver] ${description} 실패:`, error);
    return false;
  }
}

export async function publishToNaver(input: NaverPublishInput): Promise<PublishResult> {
  const content = extractContent(input.commands);
  const allHashtags = input.hashtags || content.hashtags;

  console.log(`[Naver] 발행 시작: "${input.title}" (${content.paragraphs.length}개 문단, ${content.images.length}개 이미지)`);

  // 1단계: 글쓰기 페이지 열기
  if (!await step("글쓰기 페이지 열기",
    `네이버 블로그 글쓰기 페이지를 열어줘. 주소는 https://blog.naver.com/${BLOG_ID}/postwrite 야.`
  )) return { success: false, error: "글쓰기 페이지 열기 실패" };

  // 2단계: 제목 입력
  if (!await step("제목 입력",
    `제목 입력란에 "${input.title}"를 입력해줘.`
  )) return { success: false, error: "제목 입력 실패" };

  // 3단계: 카테고리 선택
  if (input.blogCategory) {
    await step("카테고리 선택",
      `카테고리를 "${input.blogCategory}"로 선택해줘.`
    );
  }

  // 4단계: 본문 입력 (문단별로)
  const fullText = content.paragraphs.join("\n\n");
  // 텍스트를 2000자 단위로 나눠서 입력
  const chunks: string[] = [];
  let remaining = fullText;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      chunks.push(remaining);
      break;
    }
    // 2000자 근처에서 줄바꿈 위치 찾기
    let splitAt = remaining.lastIndexOf("\n\n", 2000);
    if (splitAt === -1 || splitAt < 500) splitAt = 2000;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (let i = 0; i < chunks.length; i++) {
    const action = i === 0 ? "본문 영역을 클릭하고, 아래 텍스트를 입력해줘" : "이어서 아래 텍스트를 추가로 입력해줘";
    if (!await step(`본문 입력 (${i + 1}/${chunks.length})`,
      `${action}:\n\n${chunks[i]}`
    )) return { success: false, error: `본문 입력 실패 (${i + 1}/${chunks.length})` };
  }

  // 5단계: 이미지 삽입
  for (let i = 0; i < content.images.length; i++) {
    await step(`이미지 삽입 (${i + 1}/${content.images.length})`,
      `본문에 이미지를 삽입해줘. 이미지 URL: ${content.images[i].url}`
    );
  }

  // 6단계: 소제목 서식 적용
  for (let i = 0; i < content.headings.length; i++) {
    await step(`소제목 서식 (${i + 1}/${content.headings.length})`,
      `본문에서 "ㅣ${content.headings[i].text}" 텍스트를 찾아서 드래그 선택한 후, 글자 크기를 크게(24px), 글자 색상을 초록색(#2DB400), 볼드로 변경해줘.`
    );
  }

  // 7단계: 해시태그 입력
  if (allHashtags.length > 0) {
    await step("해시태그 입력",
      `태그 영역에 다음 해시태그를 입력해줘: ${allHashtags.map(t => "#" + t).join(" ")}`
    );
  }

  // 8단계: 발행
  const publishResult = await step("발행",
    `"발행" 버튼을 클릭해서 공개 발행해줘. 발행 완료 후 글의 URL을 알려줘.`
  );

  if (!publishResult) return { success: false, error: "발행 버튼 클릭 실패" };

  return { success: true };
}

export async function confirmPublishNaver(): Promise<PublishResult> {
  return { success: true };
}
