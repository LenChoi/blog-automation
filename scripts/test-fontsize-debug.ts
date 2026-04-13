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

  // 팝업 닫기
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await page.waitForTimeout(500); await btn.click(); console.log("팝업 취소"); } } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 본문에 텍스트
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl) { await bodyEl.click(); await page.waitForTimeout(300); }
  await page.keyboard.type("테스트 소제목 글자크기", { delay: 80 });
  await page.waitForTimeout(500);

  // 마우스 드래그로 선택
  const rect = await page.evaluate(() => {
    const editor = document.querySelector('.se-content');
    if (!editor) return null;
    for (const p of editor.querySelectorAll('p.se-text-paragraph')) {
      if (p.textContent?.includes("테스트 소제목")) {
        const r = p.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    }
    return null;
  });

  if (!rect) { console.log("텍스트 못 찾음"); return; }
  console.log(`텍스트 rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);

  // 드래그
  await page.mouse.move(rect.x + 2, rect.y + rect.height / 2, { steps: 5 });
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(rect.x + rect.width - 2, rect.y + rect.height / 2, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(500);

  console.log("드래그 선택 완료, 스크린샷...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-fs-1-selected-${Date.now()}.png`) });

  // 글자크기 드롭다운 열기
  const fontSizeBtn = await page.$('button[data-name="font-size"]');
  if (fontSizeBtn && await fontSizeBtn.isVisible()) {
    await fontSizeBtn.click();
    await page.waitForTimeout(1000);
    console.log("글자크기 드롭다운 열림");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-fs-2-dropdown-${Date.now()}.png`) });

    // 드롭다운 내 모든 버튼 분석
    const options = await page.$$('button[class*="font-size"]');
    console.log(`\n글자크기 관련 버튼 ${options.length}개:`);
    for (const opt of options) {
      const cls = (await opt.getAttribute("class") || "").slice(0, 100);
      const text = (await opt.textContent() || "").trim();
      const visible = await opt.isVisible();
      console.log(`  visible=${visible} text="${text}" class="${cls}"`);
    }

    // se-toolbar-option-font-size-code-fs24-button 시도
    const fs24 = await page.$('button[class*="fs24"]');
    if (fs24) {
      console.log("\nfs24 버튼 발견!");
      const visible = await fs24.isVisible();
      console.log(`  visible: ${visible}`);
      if (visible) {
        await fs24.click();
        console.log("  fs24 클릭!");
        await page.waitForTimeout(500);
      }
    } else {
      console.log("\nfs24 버튼 없음, locator 시도...");
      const loc = page.locator('button:has(span.se-toolbar-option-label:text-is("24"))');
      const cnt = await loc.count();
      console.log(`  locator count: ${cnt}`);
      if (cnt > 0) {
        const visible = await loc.first().isVisible();
        console.log(`  visible: ${visible}`);
        if (visible) {
          await loc.first().click();
          console.log("  locator 클릭!");
        }
      }
    }
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-fs-3-result-${Date.now()}.png`) });

  await page.waitForTimeout(3000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
