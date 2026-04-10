import { Router } from "express";
import { prisma } from "../db.js";

export const blogsRouter = Router();

blogsRouter.get("/", async (_req, res) => {
  const blogs = await prisma.blog.findMany();
  res.json(blogs);
});

blogsRouter.patch("/:id", async (req, res) => {
  const blog = await prisma.blog.update({
    where: { id: parseInt(req.params.id) },
    data: req.body,
  });
  res.json(blog);
});
