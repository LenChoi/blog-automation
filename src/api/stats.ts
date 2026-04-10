import { Router } from "express";
import { prisma } from "../db.js";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalArticles, monthlyArticles, publishedArticles, pendingKeywords, avgScore] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.article.count({ where: { status: "published" } }),
    prisma.keyword.count({ where: { status: "pending" } }),
    prisma.article.aggregate({ _avg: { aiScore: true } }),
  ]);

  const blogs = await prisma.blog.findMany();

  res.json({
    totalArticles,
    monthlyArticles,
    publishedArticles,
    pendingKeywords,
    avgAiScore: Math.round(avgScore._avg.aiScore || 0),
    blogs: blogs.map((b) => ({
      id: b.id,
      name: b.name,
      platform: b.platform,
      postCount: b.postCount,
      linkEnabled: b.linkEnabled,
    })),
  });
});
