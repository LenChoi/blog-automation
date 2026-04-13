import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--window-position=100,100", "--window-size=1280,900"],
  });
  const opts: any = {
    viewport: { width: 1280, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul",
  };
  if (fs.existsSync(STORAGE_PATH)) opts.storageState = STORAGE_PATH;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(6000);

  // 팝업이 떠있는 상태에서 모든 visible 버튼 텍스트 덤프
  console.log("=== 모든 visible 버튼 ===");
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const visible = await btn.isVisible();
    if (!visible) continue;
    const text = (await btn.textContent() || "").trim();
    const cls = (await btn.getAttribute("class") || "").slice(0, 80);
    const dataName = await btn.getAttribute("data-name");
    if (text || dataName) {
      console.log(`  text="${text}", class="${cls}", data-name="${dataName}"`);
    }
  }

  // 팝업/다이얼로그/모달 DOM 분석
  console.log("\n=== 팝업/모달 DOM ===");
  const popupHTML = await page.evaluate(() => {
    const candidates = document.querySelectorAll('[class*="popup"], [class*="modal"], [class*="dialog"], [class*="layer"], [class*="dimmed"], [role="dialog"], [role="alertdialog"]');
    const results: string[] = [];
    candidates.forEach(c => {
      const el = c as HTMLElement;
      if (el.offsetHeight > 0) {
        results.push(`[${el.tagName} class="${el.className?.toString().slice(0, 100)}"]\n${el.innerHTML.slice(0, 500)}`);
      }
    });
    return results;
  });
  popupHTML.forEach((h, i) => console.log(`팝업[${i}]:`, h.slice(0, 400)));

  // 스크린샷
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `popup-debug-${Date.now()}.png`) });

  await page.waitForTimeout(3000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
