import { Router } from "express";
import { prisma } from "../db.js";
import { runPipelineForBlog, publishArticle } from "../scheduler/pipeline.js";

export const triggerRouter = Router();

triggerRouter.post("/generate", async (req, res) => {
  const { blogId } = req.body;
  const result = await runPipelineForBlog(blogId);
  res.json(result);
});

triggerRouter.post("/publish", async (req, res) => {
  const { articleId } = req.body;

  // 스케줄이 없으면 자동 생성
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { schedule: true },
  });
  if (!article) return res.status(404).json({ success: false, error: "Article not found" });

  if (!article.schedule) {
    await prisma.schedule.create({
      data: {
        articleId,
        blogId: article.blogId,
        scheduledAt: new Date(),
        reviewMode: "auto",
      },
    });
    await prisma.article.update({
      where: { id: articleId },
      data: { status: "scheduled" },
    });
  }

  const result = await publishArticle(articleId);
  res.json(result);
});
