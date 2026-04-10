import fs from "fs";
import path from "path";

const OPENCLAW_URL = "http://127.0.0.1:18789";

function getToken(): string {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return config.gateway?.auth?.token || "";
}

export async function openclawChat(prompt: string, timeoutMs = 180000): Promise<string> {
  const token = getToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: "openclaw/default",
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenClaw API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}
