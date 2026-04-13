import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--window-position=100,100", "--window-size=1280,900"],
  });
  const opts: any = { viewport: { width: 1280, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" };
  if (fs.existsSync(STORAGE_PATH)) opts.storageState = STORAGE_PATH;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(5000);

  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await page.waitForTimeout(500); await btn.click(); } } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 본문 진입
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl) { await bodyEl.click(); await page.waitForTimeout(300); }

  await page.keyboard.type("인용구 위 텍스트", { delay: 80 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // 인용구4 삽입
  console.log("[1] 인용구4 삽입");
  const dropdown = await page.$('.se-document-toolbar-select-option-button[data-name="quotation"]');
  if (dropdown && await dropdown.isVisible()) {
    await dropdown.click();
    await page.waitForTimeout(800);
    const underline = await page.$('button[class*="quotation_underline"]');
    if (underline && await underline.isVisible()) {
      await underline.click();
      console.log("  인용구4 삽입 완료");
      await page.waitForTimeout(1000);
    }
  }

  await page.keyboard.type("대표주제 텍스트입니다", { delay: 80 });
  await page.waitForTimeout(500);

  // === 인용구 탈출 테스트 ===
  console.log("\n[2] 인용구 탈출 시도들...");

  // 방법 1: 인용구 컴포넌트의 바로 아래 영역 클릭
  console.log("  방법: 인용구 컴포넌트 아래 클릭");
  const escaped = await page.evaluate(() => {
    // 현재 포커스된 인용구 컴포넌트 찾기
    const quotations = document.querySelectorAll('.se-section-quotation, .se-component-quotation');
    const last = quotations[quotations.length - 1] as HTMLElement;
    if (!last) return null;

    const rect = last.getBoundingClientRect();
    // 인용구 바로 아래 좌표 반환
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height + 20 };
  });

  if (escaped) {
    console.log(`  인용구 아래 좌표: x=${escaped.x.toFixed(0)}, y=${escaped.y.toFixed(0)}`);
    await page.mouse.click(escaped.x, escaped.y);
    await page.waitForTimeout(500);
  }

  // 탈출 확인 — 여기서 타이핑한 텍스트가 인용구 밖에 있어야 함
  await page.keyboard.type("인용구 밖 텍스트1", { delay: 80 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `quote-escape-method1-${Date.now()}.png`), fullPage: true });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);

  // 인용구2 삽입
  console.log("\n[3] 인용구2 삽입");
  const dropdown2 = await page.$('.se-document-toolbar-select-option-button[data-name="quotation"]');
  if (dropdown2 && await dropdown2.isVisible()) {
    await dropdown2.click();
    await page.waitForTimeout(800);
    const line = await page.$('button[class*="quotation_line"]');
    if (line && await line.isVisible()) {
      await line.click();
      console.log("  인용구2 삽입 완료");
      await page.waitForTimeout(1000);
    }
  }

  await page.keyboard.type("소제목 텍스트입니다", { delay: 80 });
  await page.waitForTimeout(500);

  // 인용구2 탈출
  console.log("\n[4] 인용구2 탈출");
  const escaped2 = await page.evaluate(() => {
    const quotations = document.querySelectorAll('.se-section-quotation, .se-component-quotation');
    const last = quotations[quotations.length - 1] as HTMLElement;
    if (!last) return null;
    const rect = last.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height + 20 };
  });

  if (escaped2) {
    await page.mouse.click(escaped2.x, escaped2.y);
    await page.waitForTimeout(500);
  }

  await page.keyboard.type("인용구 밖 텍스트2", { delay: 80 });
  await page.waitForTimeout(500);

  // 구분선도 인용구 밖에서 삽입되는지 테스트
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const hrBtn = await page.$('button[data-name="horizontal-line"]');
  if (hrBtn && await hrBtn.isVisible()) {
    await hrBtn.click();
    console.log("  구분선 삽입");
    await page.waitForTimeout(1000);
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  await page.keyboard.type("구분선 아래 텍스트", { delay: 80 });

  // 결과
  await page.waitForTimeout(1000);
  await page.evaluate(() => { document.querySelector('.se-content')?.scrollTo(0, 0); });
  await page.waitForTimeout(500);
  const shot = path.join(SCREENSHOT_DIR, `quote-escape-result-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\n결과: ${shot}`);

  await page.waitForTimeout(5000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
