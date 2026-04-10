import express from "express";
import { blogsRouter } from "./api/blogs.js";
import { keywordsRouter } from "./api/keywords.js";
import { articlesRouter } from "./api/articles.js";
import { schedulesRouter } from "./api/schedules.js";
import { triggerRouter } from "./api/trigger.js";
import { statsRouter } from "./api/stats.js";
import { startScheduler, stopScheduler, isSchedulerRunning } from "./scheduler/cron.js";

const app = express();
app.use(express.json());

// API routes
app.use("/api/blogs", blogsRouter);
app.use("/api/keywords", keywordsRouter);
app.use("/api/articles", articlesRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/trigger", triggerRouter);
app.use("/api/stats", statsRouter);

// Scheduler control
app.post("/api/scheduler/start", (_req, res) => {
  startScheduler();
  res.json({ running: true });
});

app.post("/api/scheduler/stop", (_req, res) => {
  stopScheduler();
  res.json({ running: false });
});

app.get("/api/scheduler/status", (_req, res) => {
  res.json({ running: isSchedulerRunning() });
});

const PORT = process.env.PORT || 3200;
app.listen(PORT, () => {
  console.log(`[Blog Automation] Server running on http://localhost:${PORT}`);
  console.log(`[Blog Automation] API docs: GET /api/stats, /api/blogs, /api/keywords, /api/articles, /api/schedules`);
});
