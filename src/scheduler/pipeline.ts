import { prisma } from "../db.js";
import { ensureKeywordsAvailable } from "../engine/keyword-generator.js";
import { generateDraft } from "../engine/content-generator.js";
import { retouchContent } from "../engine/retoucher.js";
import { validateContent } from "../engine/validator.js";
import { toEditorScript, toHtml } from "../engine/formatter.js";
import { generateImagesForArticle } from "../engine/image-generator.js";
import { shouldIncludeLink } from "../engine/link-decider.js";
import { publishToNaver, confirmPublishNaver } from "../publisher/naver.js";
import { publishToTistory, confirmPublishTistory } from "../publisher/tistory.js";
import { reviewScreenshot } from "../publisher/reviewer.js";

const MAX_RETOUCH_RETRIES = 2;
const MAX_REVIEW_RETRIES = 2;

export async function runPipelineForBlog(blogId: number): Promise<{
  success: boolean;
  articleId?: number;
  error?: string;
}> {
  const blog = await prisma.blog.findUnique({ where: { id: blogId } });
  if (!blog) return { success: false, error: "Blog not found" };

  // 1. Ensure keywords available
  await ensureKeywordsAvailable(blogId);

  // 2. Pick a keyword (different category from last article)
  const lastArticle = await prisma.article.findFirst({
    where: { blogId },
    orderBy: { createdAt: "desc" },
    include: { keyword: true },
  });
  const lastCategory = lastArticle?.keyword?.category;

  let selectedKeyword = await prisma.keyword.findFirst({
    where: {
      blogId,
      status: "pending",
      ...(lastCategory ? { NOT: { category: lastCategory } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  if (!selectedKeyword) {
    // Fallback: any pending keyword
    selectedKeyword = await prisma.keyword.findFirst({
      where: { blogId, status: "pending" },
    });
  }

  if (!selectedKeyword) return { success: false, error: "No keywords available" };

  // 3. Decide link inclusion
  const includeLink = shouldIncludeLink(
    blog.platform as "naver" | "tistory",
    blog.postCount,
    blog.linkEnabled
  );

  // 4. Generate draft (1st pass)
  const length = 1500 + Math.floor(Math.random() * 1000); // 1500~2500
  const draft = await generateDraft({
    keyword: selectedKeyword.keyword,
    blogType: blog.type as "seo" | "review",
    persona: blog.persona,
    includeLink,
    targetUrl: "https://thewreath.com",
    brandName: "더화환",
    length,
  });

  // 5. Retouch (2nd pass) with retry — 3회 시도 후 가장 좋은 결과 채택
  console.log(`[Pipeline] Draft generated: ${draft.title} (${draft.content.length} chars)`);

  interface Candidate { retouched: string; validation: Awaited<ReturnType<typeof validateContent>>; score: number; }
  const candidates: Candidate[] = [];

  for (let attempt = 0; attempt <= MAX_RETOUCH_RETRIES; attempt++) {
    const retouchedContent = await retouchContent({
      draft: attempt === 0 ? draft.content : candidates[candidates.length - 1].retouched,
      blogType: blog.type as "seo" | "review",
      persona: blog.persona,
      keyword: selectedKeyword.keyword,
    });
    console.log(`[Pipeline] Retouch #${attempt}: ${retouchedContent.length} chars, first 200: ${retouchedContent.slice(0, 200)}`);

    // 6. Validate (3rd pass)
    const validation = await validateContent(retouchedContent, selectedKeyword.keyword);
    console.log(`[Pipeline] Validation #${attempt}:`, JSON.stringify(validation));

    // 종합 점수: aiScore 낮을수록 좋고, 금지어/길이/밀도 통과 시 보너스
    const score = (100 - validation.aiScore)
      + (validation.lengthOk ? 20 : 0)
      + (validation.densityOk ? 20 : 0)
      + (validation.bannedPhrases.length === 0 ? 20 : 0);

    candidates.push({ retouched: retouchedContent, validation, score });

    if (validation.pass) break; // 완벽히 통과하면 즉시 사용
  }

  // 가장 높은 점수의 후보 선택
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const retouched = best.retouched;
  const validationResult = best.validation;
  console.log(`[Pipeline] Best candidate: score=${best.score}, aiScore=${validationResult.aiScore}, pass=${validationResult.pass}`);

  // 7. Generate images via Gemini (context-aware, SEO-friendly filenames)
  const images = await generateImagesForArticle(retouched, selectedKeyword.keyword);

  // 8. Generate hashtags
  const hashtags = generateHashtags(selectedKeyword.keyword, selectedKeyword.category);

  // 9. Format for platform
  let editorScript = null;
  let htmlContent = null;

  if (blog.platform === "naver") {
    editorScript = toEditorScript(retouched, images, hashtags);
  } else {
    htmlContent = toHtml(retouched, images, hashtags);
  }

  // Extract title from retouched content
  const titleMatch = retouched.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 25) : draft.title.slice(0, 25);

  // 10. Save article
  const article = await prisma.article.create({
    data: {
      blogId,
      keywordId: selectedKeyword.id,
      title,
      draft: draft.content,
      retouched,
      editorScript: editorScript ? JSON.parse(JSON.stringify(editorScript)) : undefined,
      htmlContent,
      hashtags: JSON.stringify(hashtags),
      aiScore: validationResult.aiScore,
      hasLink: includeLink,
      status: "ready",
    },
  });

  // Mark keyword as used
  await prisma.keyword.update({
    where: { id: selectedKeyword.id },
    data: { status: "used", usedAt: new Date() },
  });

  return { success: true, articleId: article.id };
}

function generateHashtags(keyword: string, category: string): string[] {
  const base = keyword.split(" ").filter((w) => w.length >= 2);
  const combined = base.join("");

  const tags = new Set<string>();
  tags.add(combined); // "장례식화환가격"
  base.forEach((w) => tags.add(w)); // "장례식", "화환", "가격"

  // Add category-related tags
  const categoryTags: Record<string, string[]> = {
    "화환": ["화환배달", "화환추천", "화환주문"],
    "꽃다발": ["꽃다발추천", "꽃선물", "꽃배달"],
    "화분": ["화분추천", "화분선물", "식물추천"],
    "꽃지식": ["꽃말", "꽃종류", "꽃이름"],
    "상황별": ["꽃선물추천", "꽃배달", "온라인꽃주문"],
  };

  const extras = categoryTags[category] || [];
  extras.forEach((t) => tags.add(t));

  return Array.from(tags).slice(0, 10);
}

export async function publishArticle(articleId: number): Promise<{
  success: boolean;
  publishedUrl?: string;
  error?: string;
}> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { blog: true, schedule: true },
  });
  if (!article) return { success: false, error: "Article not found" };

  const schedule = article.schedule;
  if (!schedule) return { success: false, error: "No schedule found" };

  // Update schedule status
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { status: "writing" },
  });

  // Publish (temp save + screenshot)
  let publishResult;
  if (article.blog.platform === "naver") {
    publishResult = await publishToNaver({
      commands: article.editorScript as any[],
      title: article.title,
    });
  } else {
    publishResult = await publishToTistory({
      htmlContent: article.htmlContent || "",
      title: article.title,
      hashtags: JSON.parse(article.hashtags),
    });
  }

  if (!publishResult.success) {
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: "failed", error: publishResult.error },
    });
    return { success: false, error: publishResult.error };
  }

  // Review screenshot
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: {
      status: "reviewing",
      screenshotPath: publishResult.screenshotPath,
    },
  });

  if (publishResult.screenshotPath) {
    for (let retry = 0; retry <= MAX_REVIEW_RETRIES; retry++) {
      const review = await reviewScreenshot(publishResult.screenshotPath);

      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          reviewResult: JSON.parse(JSON.stringify(review)),
          reviewedAt: new Date(),
          retryCount: retry,
        },
      });

      if (review.pass) break;

      if (review.score < 70 || retry === MAX_REVIEW_RETRIES) {
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: { status: "failed", error: `Review failed: ${review.issues.join(", ")}` },
        });
        return { success: false, error: `Review failed: score ${review.score}` };
      }
      // Minor fail — retry (would re-enter content and screenshot)
    }
  }

  // Check review mode
  const reviewMode = schedule.reviewMode;
  if (reviewMode === "manual" || reviewMode === "semi") {
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: "approved" },
    });
    // Wait for manual approval — return here
    return { success: true };
  }

  // Auto mode: confirm publish
  const confirmResult = article.blog.platform === "naver"
    ? await confirmPublishNaver()
    : await confirmPublishTistory();

  if (confirmResult.success) {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: "published",
        publishedAt: new Date(),
        publishedUrl: confirmResult.publishedUrl,
      },
    });
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: "published" },
    });
    await prisma.blog.update({
      where: { id: article.blogId },
      data: {
        postCount: { increment: 1 },
        linkEnabled: article.blog.postCount + 1 >= 10 ? true : article.blog.linkEnabled,
      },
    });
  }

  return { success: true, publishedUrl: confirmResult.publishedUrl };
}
