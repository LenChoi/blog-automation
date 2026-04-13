import { prisma } from "../src/db";
import { publishArticle } from "../src/scheduler/pipeline";

async function main() {
  const articleId = 19;

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { schedule: true },
  });
  if (!article) {
    console.log("Article not found");
    return;
  }

  console.log(`[Test] Article: "${article.title}" (${article.retouched.length} chars)`);

  // 기존 스케줄 리셋 또는 생성
  if (article.schedule) {
    await prisma.schedule.update({
      where: { id: article.schedule.id },
      data: { status: "pending" },
    });
  } else {
    await prisma.schedule.create({
      data: {
        articleId,
        blogId: article.blogId,
        scheduledAt: new Date(),
        reviewMode: "auto",
      },
    });
  }
  await prisma.article.update({
    where: { id: articleId },
    data: { status: "scheduled" },
  });

  console.log("[Test] Publishing...");
  const result = await publishArticle(articleId);
  console.log("[Test] Publish result:", JSON.stringify(result, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
