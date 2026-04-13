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
  const contextOpts: any = {
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    locale: "ko-KR", timezoneId: "Asia/Seoul",
  };
  if (fs.existsSync(STORAGE_PATH)) contextOpts.storageState = STORAGE_PATH;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(4000);
  try { const btn = await page.waitForSelector('button:has-text("취소")', { timeout: 3000 }); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 본문에 텍스트 입력
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl) { await bodyEl.click(); await page.waitForTimeout(300); }
  await page.keyboard.type("테스트 텍스트입니다", { delay: 80 });
  await page.waitForTimeout(500);

  // 텍스트 선택
  await page.evaluate(() => {
    const editor = document.querySelector('.se-content');
    if (!editor) return;
    for (const p of editor.querySelectorAll('p.se-text-paragraph')) {
      if (p.textContent?.includes("테스트")) {
        const range = document.createRange();
        range.selectNodeContents(p);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // 1. 취소선 상태 확인
  console.log("\n=== 취소선 상태 ===");
  const strikeBtn = await page.$('button[data-name="strikethrough"]');
  if (strikeBtn) {
    const cls = await strikeBtn.getAttribute("class") || "";
    const isActive = cls.includes("se-is-selected") || cls.includes("se-is-activated");
    console.log(`취소선 버튼 class: ${cls.slice(0, 100)}`);
    console.log(`취소선 활성 상태: ${isActive}`);
    if (isActive) {
      console.log("→ 취소선 해제 클릭!");
      await strikeBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // 2. 색상 팔레트 전체 DOM 덤프
  console.log("\n=== 색상 팔레트 상세 분석 ===");
  const colorBtn = await page.$('button[data-name="font-color"]');
  if (colorBtn) {
    await colorBtn.click();
    await page.waitForTimeout(1000);

    // 팔레트 컨테이너 전체 HTML
    const paletteHTML = await page.evaluate(() => {
      const containers = document.querySelectorAll('.se-property-color-picker-container');
      for (const c of containers) {
        const el = c as HTMLElement;
        if (el.offsetHeight > 0 && el.innerHTML.includes("color")) {
          return el.innerHTML.slice(0, 3000);
        }
      }
      // 열린 팝업/레이어 찾기
      const layers = document.querySelectorAll('[class*="layer"], [class*="popup"], [class*="picker"]');
      for (const l of layers) {
        const el = l as HTMLElement;
        if (el.offsetHeight > 100 && el.innerHTML.includes("color")) {
          return `[${el.className}]\n${el.innerHTML.slice(0, 3000)}`;
        }
      }
      return "not found";
    });
    console.log("팔레트 HTML:");
    console.log(paletteHTML.slice(0, 2000));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-color2-${Date.now()}.png`), fullPage: true });
  }

  await page.waitForTimeout(3000);
  await context.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
