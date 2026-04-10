import fs from "fs";
import path from "path";

const OPENCLAW_URL = "http://127.0.0.1:18789";
const SESSION_KEY = "blog-automation";
const MAX_RETRIES = 10;

function getToken(): string {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return config.gateway?.auth?.token || "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGateway(maxWaitMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${OPENCLAW_URL}/health`);
      const data = await res.json();
      if (data?.ok) return true;
    } catch {}
    await sleep(2000);
  }
  return false;
}

export async function openclawChat(prompt: string, timeoutMs = 3600000): Promise<string> {
  const token = getToken();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "x-openclaw-session-key": SESSION_KEY,
        },
        body: JSON.stringify({
          model: "openclaw/default",
          stream: false,
          user: SESSION_KEY,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenClaw API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || "";

      if (content) return content;
      throw new Error("Empty response from OpenClaw");

    } catch (error) {
      clearTimeout(timeout);
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[OpenClaw] 시도 ${attempt + 1}/${MAX_RETRIES} 실패: ${msg}`);

      if (attempt < MAX_RETRIES - 1) {
        console.log(`[OpenClaw] 게이트웨이 재연결 대기 중...`);
        const alive = await waitForGateway();
        if (!alive) {
          console.error(`[OpenClaw] 게이트웨이 응답 없음. 재시도 중단.`);
          throw new Error(`OpenClaw gateway not responding after retry`);
        }
        console.log(`[OpenClaw] 게이트웨이 복구 확인. 재시도...`);
      } else {
        throw new Error(`OpenClaw failed after ${MAX_RETRIES} attempts: ${msg}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("OpenClaw: unreachable");
}
