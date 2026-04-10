import { Router } from "express";
import { prisma } from "../db.js";
import { generateKeywords } from "../engine/keyword-generator.js";

export const keywordsRouter = Router();

keywordsRouter.get("/", async (req, res) => {
  const { status, blogId, category } = req.query;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (blogId) where.blogId = parseInt(blogId as string);
  if (category) where.category = category;

  const keywords = await prisma.keyword.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  res.json(keywords);
});

keywordsRouter.post("/generate", async (req, res) => {
  const { blogId } = req.body;
  const result = await generateKeywords(blogId);
  res.json({ generated: result.length, keywords: result });
});

keywordsRouter.patch("/:id", async (req, res) => {
  const keyword = await prisma.keyword.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(keyword);
});
