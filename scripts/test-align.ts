import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

async function wait(ms: number) { await new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--window-position=100,100", "--window-size=1280,900"],
  });
  const ctxOpts: any = { viewport: { width: 1280, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" };
  if (fs.existsSync(STORAGE_PATH)) ctxOpts.storageState = STORAGE_PATH;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(5000);
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await wait(500); await btn.click(); } } catch {}
  await wait(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await wait(500);

  // 제목
  await page.click('.se-documentTitle .se-text-paragraph');
  await wait(500);
  await page.keyboard.type("정렬 테스트", { delay: 80 });
  await wait(500);

  // 본문 진입
  const be = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (be && await be.isVisible()) { await be.click(); await wait(500); }

  const mod = process.platform === "darwin" ? "Meta" : "Control";

  // ======= 방법 1: Cmd+E 단축키 =======
  console.log("\n=== 방법 1: Cmd+E 단축키 ===");
  await page.keyboard.press(`${mod}+e`);
  await wait(500);

  // 정렬 상태 확인
  const align1 = await page.evaluate(() => {
    const p = document.querySelector('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph') as HTMLElement;
    return p?.className || "";
  });
  console.log(`  현재 paragraph class: ${align1}`);

  await page.keyboard.type("Cmd+E 후 타이핑", { delay: 80 });
  await page.keyboard.press("Enter");
  await wait(300);

  const align1after = await page.evaluate(() => {
    const ps = document.querySelectorAll('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph');
    return Array.from(ps).map(p => (p as HTMLElement).className);
  });
  console.log(`  타이핑 후 paragraph classes:`);
  align1after.forEach((c, i) => console.log(`    [${i}] ${c.slice(0, 100)}`));

  // 스크린샷
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `align-method1-${Date.now()}.png`) });

  // ======= 방법 2: 정렬 드롭다운 =======
  console.log("\n=== 방법 2: 정렬 드롭다운 ===");
  const alignBtn = await page.$('button[data-name="align-drop-down-with-justify"]');
  if (alignBtn && await alignBtn.isVisible()) {
    await alignBtn.click();
    await wait(1000);

    // 모든 정렬 옵션 분석
    const alignOpts = await page.$$eval('button[class*="align"]', els =>
      els.filter(el => (el as HTMLElement).offsetHeight > 0)
        .map(el => `class="${el.className?.toString().slice(0, 80)}" text="${el.textContent?.trim().slice(0, 20)}"`)
    );
    console.log("정렬 옵션:");
    alignOpts.forEach(o => console.log(`  ${o}`));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `align-dropdown-${Date.now()}.png`) });

    // 가운데 정렬 옵션 클릭 시도
    const centerOpt = await page.$('button[class*="se-align-center"]');
    if (centerOpt && await centerOpt.isVisible()) {
      await centerOpt.click();
      console.log("  se-align-center 클릭");
      await wait(500);
    } else {
      await page.keyboard.press("Escape");
    }
  }

  await page.keyboard.type("드롭다운 후 타이핑", { delay: 80 });
  await wait(500);

  const align2after = await page.evaluate(() => {
    const ps = document.querySelectorAll('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph');
    return Array.from(ps).map(p => (p as HTMLElement).className);
  });
  console.log(`  타이핑 후 paragraph classes:`);
  align2after.forEach((c, i) => console.log(`    [${i}] ${c.slice(0, 100)}`));

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `align-method2-${Date.now()}.png`) });

  await wait(5000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
