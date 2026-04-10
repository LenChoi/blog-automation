import { Router } from "express";
import { prisma } from "../db.js";
import { runPipelineForBlog } from "../scheduler/pipeline.js";

export const articlesRouter = Router();

articlesRouter.get("/", async (req, res) => {
  const { status, blogId } = req.query;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (blogId) where.blogId = parseInt(blogId as string);

  const articles = await prisma.article.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { keyword: true, blog: true },
  });
  res.json(articles);
});

articlesRouter.get("/:id", async (req, res) => {
  const article = await prisma.article.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { keyword: true, blog: true, schedule: true },
  });
  if (!article) return res.status(404).json({ error: "Not found" });
  res.json(article);
});

articlesRouter.post("/generate", async (req, res) => {
  const { blogId } = req.body;
  const result = await runPipelineForBlog(blogId);
  res.json(result);
});

articlesRouter.delete("/:id", async (req, res) => {
  await prisma.article.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});
