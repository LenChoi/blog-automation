import { Router } from "express";
import { runPipelineForBlog, publishArticle } from "../scheduler/pipeline.js";

export const triggerRouter = Router();

triggerRouter.post("/generate", async (req, res) => {
  const { blogId } = req.body;
  const result = await runPipelineForBlog(blogId);
  res.json(result);
});

triggerRouter.post("/publish", async (req, res) => {
  const { articleId } = req.body;
  const result = await publishArticle(articleId);
  res.json(result);
});
