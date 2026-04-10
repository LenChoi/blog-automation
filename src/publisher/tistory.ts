import { openclawChat } from "./openclaw.js";

const BLOG_URL = "daily-flower-log";

export interface TistoryPublishInput {
  htmlContent: string;
  title: string;
  hashtags: string[];
  blogCategory?: string;
}

export interface PublishResult {
  success: boolean;
  screenshotPath?: string;
  publishedUrl?: string;
  error?: string;
}

export async function publishToTistory(input: TistoryPublishInput): Promise<PublishResult> {
  const hashtagStr = input.hashtags.map(t => t).join(", ");
  const categoryStr = input.blogCategory ? `카테고리 "${input.blogCategory}"를 선택해줘.` : "";

  const prompt = `티스토리 블로그에 글을 작성해줘. 아래 지시사항을 정확히 따라줘.

1. 브라우저에서 https://${BLOG_URL}.tistory.com/manage/newpost 에 접속해줘
2. 글쓰기 페이지가 로드되면:
   - 제목 입력란에: ${input.title}
   ${categoryStr}
   - "HTML" 모드로 전환해줘
   - 에디터 내용을 지우고 아래 HTML을 붙여넣기해줘
   - 태그 입력란에: ${hashtagStr}
3. "발행" 버튼을 클릭해서 공개 발행해줘
4. 발행 완료 후 글의 URL을 알려줘

[HTML 내용]
${input.htmlContent}`;

  try {
    console.log(`[Tistory] Publishing: "${input.title}" via OpenClaw...`);
    const result = await openclawChat(prompt, 300000);
    console.log(`[Tistory] OpenClaw response: ${result.slice(0, 300)}`);

    const urlMatch = result.match(/https?:\/\/[^\s)]*tistory\.com\/[^\s)]+/);
    const publishedUrl = urlMatch ? urlMatch[0] : undefined;

    const isSuccess = result.includes("발행") || result.includes("완료") || !!publishedUrl;

    return {
      success: isSuccess,
      publishedUrl,
      error: isSuccess ? undefined : result.slice(0, 200),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Tistory] Publish failed:`, msg);
    return { success: false, error: msg };
  }
}

export async function confirmPublishTistory(): Promise<PublishResult> {
  return { success: true };
}
