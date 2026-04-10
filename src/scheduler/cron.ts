import cron from "node-cron";
import { prisma } from "../db.js";
import { generatePublishTime, getDayType, shouldPublishToday } from "./time-randomizer.js";
import { runPipelineForBlog, publishArticle } from "./pipeline.js";

let schedulerRunning = false;
let cronJob: cron.ScheduledTask | null = null;
let dailyJob: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;

  // Run every hour to check for pending schedules
  cronJob = cron.schedule("0 * * * *", async () => {
    await checkAndExecuteSchedules();
  });

  // Daily at 1:00 AM: plan tomorrow's schedules
  dailyJob = cron.schedule("0 1 * * *", async () => {
    await planDailySchedules();
  });

  console.log("[Scheduler] Started");
}

export function stopScheduler(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  if (dailyJob) {
    dailyJob.stop();
    dailyJob = null;
  }
  schedulerRunning = false;
  console.log("[Scheduler] Stopped");
}

export function isSchedulerRunning(): boolean {
  return schedulerRunning;
}

async function planDailySchedules(): Promise<void> {
  const blogs = await prisma.blog.findMany();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const dayType = getDayType(tomorrow);

  let naverTime: Date | undefined;

  for (const blog of blogs) {
    if (!shouldPublishToday(dayType)) continue;

    // Check minimum interval
    const lastSchedule = await prisma.schedule.findFirst({
      where: { blogId: blog.id, status: { not: "failed" } },
      orderBy: { scheduledAt: "desc" },
    });

    if (lastSchedule) {
      const minHours = blog.platform === "naver" ? 48 : 24;
      const hoursSinceLast = (tomorrow.getTime() - lastSchedule.scheduledAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < minHours) continue;
    }

    // Check if article is ready
    const readyArticle = await prisma.article.findFirst({
      where: { blogId: blog.id, status: "ready" },
      orderBy: { createdAt: "asc" },
    });

    if (!readyArticle) {
      // Generate new article
      const result = await runPipelineForBlog(blog.id);
      if (!result.success || !result.articleId) continue;

      const articleId = result.articleId;
      const publishTime = generatePublishTime(
        blog.platform as "naver" | "tistory",
        tomorrow,
        naverTime
      );

      if (blog.platform === "naver") naverTime = publishTime;

      const reviewMode = (process.env.REVIEW_MODE || "semi") as "auto" | "semi" | "manual";

      await prisma.schedule.create({
        data: {
          articleId,
          blogId: blog.id,
          scheduledAt: publishTime,
          reviewMode,
        },
      });

      await prisma.article.update({
        where: { id: articleId },
        data: { status: "scheduled" },
      });
    } else {
      const publishTime = generatePublishTime(
        blog.platform as "naver" | "tistory",
        tomorrow,
        naverTime
      );

      if (blog.platform === "naver") naverTime = publishTime;

      const reviewMode = (process.env.REVIEW_MODE || "semi") as "auto" | "semi" | "manual";

      await prisma.schedule.create({
        data: {
          articleId: readyArticle.id,
          blogId: blog.id,
          scheduledAt: publishTime,
          reviewMode,
        },
      });

      await prisma.article.update({
        where: { id: readyArticle.id },
        data: { status: "scheduled" },
      });
    }
  }

  console.log(`[Scheduler] Planned schedules for ${tomorrow.toDateString()}`);
}

async function checkAndExecuteSchedules(): Promise<void> {
  const now = new Date();

  const dueSchedules = await prisma.schedule.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: now },
    },
    include: { article: true },
  });

  for (const schedule of dueSchedules) {
    console.log(`[Scheduler] Executing schedule #${schedule.id} for article "${schedule.article.title}"`);
    await publishArticle(schedule.articleId);
  }
}
