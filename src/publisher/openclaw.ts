import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const MAX_RETRIES = 2;

/** 발행 단위의 세션 키 생성 — 발행 시작 시 한 번만 호출 */
export function createSessionKey(): string {
  return `blog-${Date.now()}`;
}

export async function openclawChat(prompt: string, sessionKey: string, timeoutMs = 300000): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await runOpenclawAgent(prompt, timeoutMs, sessionKey);

      if (result.errors.length > 0) {
        console.warn(`[OpenClaw] 브라우저 에러 ${result.errors.length}건:`);
        for (const err of result.errors.slice(0, 5)) {
          console.warn(`  - ${err}`);
        }
      }

      if (result.text) return result.text;
      throw new Error("Empty response from OpenClaw");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[OpenClaw] 시도 ${attempt + 1}/${MAX_RETRIES} 실패: ${msg.slice(0, 300)}`);

      if (attempt >= MAX_RETRIES - 1) {
        throw new Error(`OpenClaw failed after ${MAX_RETRIES} attempts: ${msg.slice(0, 300)}`);
      }
    }
  }

  throw new Error("OpenClaw: unreachable");
}

interface OpenClawResult {
  text: string;
  errors: string[];
}

function runOpenclawAgent(prompt: string, timeoutMs: number, sessionKey: string): Promise<OpenClawResult> {
  const tmpFile = join(tmpdir(), `openclaw-prompt-${Date.now()}.txt`);
  writeFileSync(tmpFile, prompt, "utf-8");

  return new Promise((resolve, reject) => {
    const timeoutSec = Math.ceil(timeoutMs / 1000);

    const child = execFile(
      "/bin/sh",
      [
        "-c",
        `openclaw agent --session-id "${sessionKey}" --message "$(cat "${tmpFile}")" --json --timeout ${timeoutSec}`,
      ],
      { timeout: timeoutMs + 10000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        try { unlinkSync(tmpFile); } catch {}

        const errors: string[] = [];
        if (stderr) {
          for (const line of stderr.split("\n")) {
            if (line.includes("browser failed") || line.includes("Error:")) {
              errors.push(line.trim());
            }
          }
        }

        if (error) {
          return reject(new Error(`OpenClaw CLI error: ${error.message}\nstderr: ${stderr?.slice(0, 500)}`));
        }

        let text = "";
        try {
          const data = JSON.parse(stdout);
          text =
            data?.result?.payloads?.[0]?.text ||
            data?.payloads?.[0]?.text ||
            "";
        } catch {
          const jsonMatch = stdout.match(/\{[\s\S]*"payloads"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              text =
                data?.result?.payloads?.[0]?.text ||
                data?.payloads?.[0]?.text ||
                "";
            } catch {}
          }
          if (!text) text = stdout.trim();
        }

        resolve({ text, errors });
      },
    );
  });
}
