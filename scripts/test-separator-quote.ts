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

  // 본문 영역 진입
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl) { await bodyEl.click(); await page.waitForTimeout(300); }

  // === 테스트 1: 구분선 삽입 ===
  console.log("\n=== 구분선 테스트 ===");
  await page.keyboard.type("구분선 위 텍스트입니다", { delay: rand(70, 130) });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // 구분선 버튼 클릭
  const hrBtn = await page.$('button[data-name="horizontal-line"]');
  if (hrBtn && await hrBtn.isVisible()) {
    await hrBtn.click();
    await page.waitForTimeout(1000);
    console.log("구분선 버튼 클릭");

    // 구분선 스타일 선택 팝업이 나올 수 있음 — 스크린샷으로 확인
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-hr-1-${Date.now()}.png`) });

    // 구분선 옵션이 있으면 첫 번째 선택
    const hrOptions = await page.$$('button[data-name="horizontal-line"]');
    console.log(`구분선 관련 버튼 ${hrOptions.length}개`);
    for (const opt of hrOptions) {
      const cls = (await opt.getAttribute("class") || "").slice(0, 100);
      const text = (await opt.textContent() || "").trim();
      const visible = await opt.isVisible();
      console.log(`  visible=${visible} text="${text}" class="${cls}"`);
    }

    // 구분선 옵션 드롭다운 — 첫 번째 구분선 스타일 클릭
    const hrStyleBtns = await page.$$('[class*="horizontal-line"] [class*="option"], [class*="horizontal"] button');
    for (const btn of hrStyleBtns) {
      if (await btn.isVisible()) {
        const cls = (await btn.getAttribute("class") || "");
        console.log(`  구분선 옵션: class="${cls.slice(0, 80)}"`);
      }
    }

    await page.waitForTimeout(500);
  } else {
    console.log("구분선 버튼 없음");
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.type("구분선 아래 텍스트입니다", { delay: rand(70, 130) });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // === 테스트 2: 인용구 삽입 ===
  console.log("\n=== 인용구 테스트 ===");

  // 인용구 버튼 클릭
  const quoteBtn = await page.$('button[data-name="quotation"]');
  if (quoteBtn && await quoteBtn.isVisible()) {
    await quoteBtn.click();
    await page.waitForTimeout(1000);
    console.log("인용구 버튼 클릭");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-quote-1-${Date.now()}.png`) });

    // 인용구 옵션 분석
    const quoteOptions = await page.$$('button[data-name="quotation"]');
    console.log(`인용구 관련 버튼 ${quoteOptions.length}개`);
    for (const opt of quoteOptions) {
      const cls = (await opt.getAttribute("class") || "").slice(0, 100);
      const text = (await opt.textContent() || "").trim();
      const visible = await opt.isVisible();
      console.log(`  visible=${visible} text="${text}" class="${cls}"`);
    }

    await page.waitForTimeout(500);
  } else {
    console.log("인용구 버튼 없음");
  }

  // 인용구 안에 텍스트 입력 시도
  await page.waitForTimeout(500);
  await page.keyboard.type("이것은 인용구 테스트입니다. 핵심 정보 요약!", { delay: rand(70, 130) });
  await page.waitForTimeout(500);

  // 결과 스크린샷
  await page.waitForTimeout(1000);
  const shot = path.join(SCREENSHOT_DIR, `test-hr-quote-result-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\n결과 스크린샷: ${shot}`);

  await page.waitForTimeout(5000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
