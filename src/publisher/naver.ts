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
      case "text": {
        // 500자 단위로 나눠서 입력
        const text = block.content;
        const chunkSize = 500;
        const chunks: string[] = [];
        let remaining = text;
        while (remaining.length > 0) {
          if (remaining.length <= chunkSize) {
            chunks.push(remaining);
            break;
          }
          let splitAt = remaining.lastIndexOf("\n", chunkSize);
          if (splitAt === -1 || splitAt < 200) splitAt = remaining.lastIndexOf(" ", chunkSize);
          if (splitAt === -1 || splitAt < 200) splitAt = chunkSize;
          chunks.push(remaining.slice(0, splitAt));
          remaining = remaining.slice(splitAt).trimStart();
        }

        for (let c = 0; c < chunks.length; c++) {
          const action = (isFirstBlock && c === 0) ? "본문 영역을 클릭하고" : "현재 커서 위치에서 이어서";
          await step(`본문 텍스트 (블록${i + 1}, ${c + 1}/${chunks.length})`,
            `${action} 아래 텍스트를 입력해줘. **볼드**로 표시된 부분은 입력 후 해당 텍스트를 선택해서 볼드+초록색(#2DB400)으로 서식을 적용해줘:\n\n${chunks[c]}`
          );
        }
        break;
      }

      case "heading":
        await step(`소제목 입력 (${i + 1}/${blocks.length})`,
          `${clickAction} 엔터를 두번 치고, "${block.content}" 를 입력해줘. 그리고 방금 입력한 "${block.content}" 텍스트 전체를 드래그로 선택한 후, 다음 서식을 적용해줘:
1. 글자 크기를 24px 또는 "크게"로 변경
2. 글자 색상을 초록색(#2DB400)으로 변경
3. 볼드(굵게) 적용
서식 적용 후 텍스트 끝에 커서를 놓고 엔터를 쳐서 다음 줄로 이동해줘.`
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

  // 6단계: 발행
  const publishResult = await step("발행",
    `"발행" 버튼을 클릭해서 공개 발행해줘. 발행 완료 후 글의 URL을 알려줘.`
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
