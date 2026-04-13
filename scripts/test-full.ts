import { prisma } from "../src/db";
import { runPipelineForBlog, publishArticle } from "../src/scheduler/pipeline";

async function main() {
  // 1. 새 글 생성
  console.log("[Test] Generating new article for blog 1 (Naver)...");
  const genResult = await runPipelineForBlog(1);
  console.log("[Test] Generation result:", JSON.stringify(genResult, null, 2));

  if (!genResult.success || !genResult.articleId) {
    console.error("[Test] Generation failed, aborting");
    await prisma.$disconnect();
    return;
  }

  // 2. 생성된 글 확인
  const article = await prisma.article.findUnique({ where: { id: genResult.articleId } });
  console.log(`[Test] Article: "${article!.title}" (${article!.retouched.length} chars)`);

  // 3. 스케줄 생성
  await prisma.schedule.create({
    data: {
      articleId: genResult.articleId,
      blogId: 1,
      scheduledAt: new Date(),
      reviewMode: "auto",
    },
  });
  await prisma.article.update({
    where: { id: genResult.articleId },
    data: { status: "scheduled" },
  });

  // 4. 발행
  console.log("[Test] Publishing...");
  const pubResult = await publishArticle(genResult.articleId);
  console.log("[Test] Publish result:", JSON.stringify(pubResult, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
