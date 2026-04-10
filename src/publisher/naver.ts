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

function commandsToMarkdown(commands: EditorCommand[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case "heading":
        parts.push(`\n## ${cmd.text}\n`);
        break;
      case "text":
        parts.push(cmd.content || "");
        break;
      case "highlight":
        parts.push(`**${cmd.text}**`);
        break;
      case "newline":
        parts.push("\n");
        break;
      case "image":
        parts.push(`\n![이미지](${cmd.path})\n`);
        break;
      case "quote":
        parts.push(`\n> ${cmd.text}\n`);
        break;
      case "separator":
        parts.push("\n---\n");
        break;
      case "hashtags":
        if (cmd.tags) parts.push(`\n${cmd.tags.map(t => "#" + t).join(" ")}`);
        break;
    }
  }
  return parts.join("");
}

export async function publishToNaver(input: NaverPublishInput): Promise<PublishResult> {
  const content = commandsToMarkdown(input.commands);
  const hashtagStr = input.hashtags?.map(t => "#" + t).join(" ") || "";
  const categoryStr = input.blogCategory ? `카테고리 "${input.blogCategory}"를 선택해줘.` : "";

  const prompt = `네이버 블로그에 글을 작성해줘. 아래 지시사항을 정확히 따라줘.

1. 브라우저에서 https://blog.naver.com/${BLOG_ID} 에 접속해줘
2. "글쓰기" 버튼을 클릭해줘
3. 스마트에디터가 로드되면:
   - 제목 입력란에: ${input.title}
   ${categoryStr}
   - 본문에 아래 내용을 입력해줘 (마크다운 형식을 네이버 에디터에 맞게 변환해서)
   - 이미지 URL은 에디터에 직접 이미지로 삽입해줘
   - 소제목(##)은 크기를 크게, 색상을 초록색(#2DB400)으로 해줘
   - **볼드** 텍스트는 형광펜(연두색 배경)으로 강조해줘
   - 인용구(>)는 인용구 컴포넌트를 사용해줘
4. 해시태그 영역에: ${hashtagStr}
5. "발행" 버튼을 클릭해서 발행해줘 (임시저장이 아닌 발행)
6. 발행이 완료되면 발행된 글의 URL을 알려줘

[본문 내용]
${content}`;

  try {
    console.log(`[Naver] Publishing: "${input.title}" via OpenClaw...`);
    const result = await openclawChat(prompt, 300000); // 5분 타임아웃
    console.log(`[Naver] OpenClaw response: ${result.slice(0, 300)}`);

    // URL 추출 시도
    const urlMatch = result.match(/https?:\/\/blog\.naver\.com\/[^\s)]+/);
    const publishedUrl = urlMatch ? urlMatch[0] : undefined;

    const isSuccess = result.includes("발행") || result.includes("완료") || !!publishedUrl;

    return {
      success: isSuccess,
      publishedUrl,
      error: isSuccess ? undefined : result.slice(0, 200),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Naver] Publish failed:`, msg);
    return { success: false, error: msg };
  }
}

export async function confirmPublishNaver(): Promise<PublishResult> {
  // 이미 publishToNaver에서 바로 발행하므로 별도 확인 불필요
  return { success: true };
}
