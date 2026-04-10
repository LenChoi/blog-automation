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

// 에디터 커맨드를 순서대로 입력할 블록으로 변환
interface ContentBlock {
  type: "text" | "heading" | "image" | "quote";
  content: string;
}

function commandsToBlocks(commands: EditorCommand[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let currentText = "";

  for (const cmd of commands) {
    switch (cmd.type) {
      case "heading":
        if (currentText.trim()) {
          blocks.push({ type: "text", content: currentText.trim() });
          currentText = "";
        }
        blocks.push({ type: "heading", content: cmd.text || "" });
        break;
      case "text":
        currentText += cmd.content || "";
        break;
      case "highlight":
        currentText += cmd.text || "";
        break;
      case "newline":
        currentText += "\n";
        break;
      case "image":
        if (currentText.trim()) {
          blocks.push({ type: "text", content: currentText.trim() });
          currentText = "";
        }
        if (cmd.path) blocks.push({ type: "image", content: cmd.path });
        break;
      case "quote":
        if (currentText.trim()) {
          blocks.push({ type: "text", content: currentText.trim() });
          currentText = "";
        }
        if (cmd.text) blocks.push({ type: "quote", content: cmd.text });
        break;
      case "separator":
      case "hashtags":
        break;
    }
  }
  if (currentText.trim()) blocks.push({ type: "text", content: currentText.trim() });

  return blocks;
}

async function step(description: string, prompt: string): Promise<string> {
  console.log(`[Naver] ${description}...`);
  try {
    const result = await openclawChat(prompt, 300000);
    console.log(`[Naver] ${description} → ${result.slice(0, 100)}`);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Naver] ${description} 실패:`, msg);
    return "";
  }
}

export async function publishToNaver(input: NaverPublishInput): Promise<PublishResult> {
  const blocks = commandsToBlocks(input.commands);
  const allHashtags = input.hashtags || [];
  const headings = blocks.filter(b => b.type === "heading").map(b => b.content);

  console.log(`[Naver] 발행 시작: "${input.title}" (${blocks.length}개 블록, 소제목 ${headings.length}개)`);

  // 1단계: 글쓰기 페이지 열기
  const openResult = await step("글쓰기 페이지 열기",
    `네이버 블로그 글쓰기 페이지를 열어줘. 주소는 https://blog.naver.com/${BLOG_ID}/postwrite 야. 에디터가 완전히 로드될 때까지 기다려줘.`
  );
  if (!openResult) return { success: false, error: "글쓰기 페이지 열기 실패" };

  // 2단계: 제목 입력
  await step("제목 입력",
    `제목 입력란에 "${input.title}"를 입력해줘.`
  );

  // 3단계: 카테고리 선택
  if (input.blogCategory) {
    await step("카테고리 선택",
      `카테고리를 "${input.blogCategory}"로 선택해줘.`
    );
  }

  // 4단계: 본문 순서대로 입력 (텍스트 → 이미지 → 소제목 → 텍스트 순)
  let isFirstBlock = true;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const clickAction = isFirstBlock ? "본문 영역을 클릭하고" : "현재 커서 위치에서 이어서";
    isFirstBlock = false;

    switch (block.type) {
      case "text":
        await step(`본문 텍스트 (${i + 1}/${blocks.length})`,
          `${clickAction} 아래 텍스트를 입력해줘:\n\n${block.content}`
        );
        break;

      case "heading":
        await step(`소제목 입력 (${i + 1}/${blocks.length})`,
          `${clickAction} 엔터를 한번 치고, "ㅣ${block.content}" 를 입력해줘. 그리고 입력한 "ㅣ${block.content}" 텍스트를 드래그로 전체 선택한 후, 글자 크기를 24px(또는 "크게")로, 글자 색상을 초록색(#2DB400)으로, 볼드(굵게)를 적용해줘. 서식 적용 후 엔터를 쳐서 다음 줄로 이동해줘.`
        );
        break;

      case "image":
        await step(`이미지 삽입 (${i + 1}/${blocks.length})`,
          `현재 커서 위치에서 엔터를 치고, 에디터의 사진/이미지 삽입 기능을 사용해서 이미지를 삽입해줘. 이미지 URL: ${block.content} . 삽입 후 엔터를 쳐서 다음 줄로 이동해줘.`
        );
        break;

      case "quote":
        await step(`인용구 (${i + 1}/${blocks.length})`,
          `${clickAction} 에디터의 인용구 컴포넌트를 사용해서 다음 내용을 인용구로 입력해줘:\n${block.content}`
        );
        break;
    }
  }

  // 5단계: 해시태그 입력
  if (allHashtags.length > 0) {
    await step("해시태그 입력",
      `태그 입력 영역에 다음 태그를 하나씩 입력해줘: ${allHashtags.join(", ")}`
    );
  }

  // 6단계: 임시저장 + 미리보기 확인
  const previewResult = await step("미리보기 확인",
    `"임시저장" 버튼을 클릭해줘. 저장이 되면 미리보기를 열어서 글이 어떻게 보이는지 확인해줘. 다음 항목을 체크하고 결과를 알려줘:
1. 제목이 정상적으로 표시되는지
2. 소제목이 초록색 큰 글씨로 표시되는지
3. 이미지가 본문 중간에 올바른 위치에 표시되는지 (상단에 몰려있으면 안됨)
4. 텍스트가 잘리지 않고 전체가 표시되는지
5. 해시태그가 하단에 표시되는지
문제가 있으면 "문제있음: [문제내용]"으로, 정상이면 "정상"으로 답해줘.`
  );

  // 7단계: 확인 결과에 따라 발행
  if (previewResult.includes("문제있음")) {
    console.log(`[Naver] 미리보기 문제 발견: ${previewResult}`);
    return { success: false, error: `미리보기 문제: ${previewResult.slice(0, 200)}` };
  }

  // 8단계: 발행
  const publishResult = await step("발행",
    `미리보기를 닫고 "발행" 버튼을 클릭해서 공개 발행해줘. 발행 완료 후 글의 URL을 알려줘.`
  );

  const urlMatch = publishResult.match(/https?:\/\/blog\.naver\.com\/[^\s)]+/);

  return {
    success: true,
    publishedUrl: urlMatch ? urlMatch[0] : undefined,
  };
}

export async function confirmPublishNaver(): Promise<PublishResult> {
  return { success: true };
}
