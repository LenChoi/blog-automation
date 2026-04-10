import { Router } from "express";
import { prisma } from "../db.js";
import { publishArticle } from "../scheduler/pipeline.js";
import { confirmPublishNaver } from "../publisher/naver.js";
import { confirmPublishTistory } from "../publisher/tistory.js";

export const schedulesRouter = Router();

schedulesRouter.get("/", async (_req, res) => {
  const schedules = await prisma.schedule.findMany({
    orderBy: { scheduledAt: "desc" },
    take: 50,
    include: { article: true, blog: true },
  });
  res.json(schedules);
});

schedulesRouter.patch("/:id", async (req, res) => {
  const schedule = await prisma.schedule.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(schedule);
});

schedulesRouter.post("/:id/approve", async (req, res) => {
  const schedule = await prisma.schedule.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { article: { include: { blog: true } } },
  });
  if (!schedule) return res.status(404).json({ error: "Not found" });

  // Confirm publish
  const result = schedule.article.blog.platform === "naver"
    ? await confirmPublishNaver()
    : await confirmPublishTistory();

  if (result.success) {
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: "published" },
    });
    await prisma.article.update({
      where: { id: schedule.articleId },
      data: {
        status: "published",
        publishedAt: new Date(),
        publishedUrl: result.publishedUrl,
      },
    });
    await prisma.blog.update({
      where: { id: schedule.blogId },
      data: { postCount: { increment: 1 } },
    });
  }

  res.json(result);
});
