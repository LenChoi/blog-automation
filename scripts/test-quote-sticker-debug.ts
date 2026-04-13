import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

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

  // ============================
  // 인용구 스타일 드롭다운 분석
  // ============================
  console.log("\n=== 인용구 스타일 분석 ===");
  const quoteDropdown = await page.$('.se-document-toolbar-select-option-button[data-name="quotation"]');
  if (quoteDropdown && await quoteDropdown.isVisible()) {
    await quoteDropdown.click();
    await page.waitForTimeout(1000);

    // 모든 인용구 옵션 버튼 클래스명 전체 출력
    const options = await page.$$eval('button[class*="quotation"]', els =>
      els.filter(el => (el as HTMLElement).offsetHeight > 0)
        .map((el, i) => `[${i}] class="${el.className}" text="${el.textContent?.trim().slice(0, 30)}"`)
    );
    console.log("인용구 버튼들:");
    options.forEach(o => console.log(`  ${o}`));

    // option-icon-button들만
    const optionBtns = await page.$$('button[class*="se-toolbar-option-icon-button"][class*="quotation"]');
    console.log(`\n인용구 스타일 옵션 ${optionBtns.length}개:`);
    for (let i = 0; i < optionBtns.length; i++) {
      const cls = await optionBtns[i].getAttribute("class") || "";
      const visible = await optionBtns[i].isVisible();
      console.log(`  [${i}] visible=${visible} class="${cls}"`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-quote-dropdown-${Date.now()}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // ============================
  // 스티커 패널 분석
  // ============================
  console.log("\n=== 스티커 패널 분석 ===");
  const stickerBtn = await page.$('button[data-name="sticker"]');
  if (stickerBtn && await stickerBtn.isVisible()) {
    await stickerBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-sticker-panel-${Date.now()}.png`) });

    // 스티커 패널 내부 DOM 분석
    const panelHTML = await page.evaluate(() => {
      // 토글된 패널 찾기
      const panels = document.querySelectorAll('[class*="sticker"], [class*="emoticon"]');
      const results: string[] = [];
      panels.forEach(p => {
        const el = p as HTMLElement;
        if (el.offsetHeight > 50) {
          results.push(`[${el.tagName} class="${el.className?.toString().slice(0, 100)}"]\nchildren: ${el.children.length}\ninnerHTML(500): ${el.innerHTML.slice(0, 500)}`);
        }
      });
      return results;
    });
    console.log("스티커 패널 DOM:");
    panelHTML.forEach(h => console.log(`  ${h.slice(0, 300)}`));

    // iframe 확인 (스티커가 iframe 안에 있을 수 있음)
    const frames = page.frames();
    console.log(`\n페이지 프레임 ${frames.length}개:`);
    for (const f of frames) {
      console.log(`  name="${f.name()}" url="${f.url().slice(0, 100)}"`);
    }

    await page.keyboard.press("Escape");
  }

  await page.waitForTimeout(3000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
