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

  await page.goto(`https://blog.naver.com/${BLOG_ID}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  const wb = await page.$('a[href*="postwrite"]');
  if (!wb) {
    console.log("로그인 필요");
    await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/blog.naver.com/**`, { timeout: 30000 }).catch(() => {});
    await ctx.storageState({ path: STORAGE_PATH });
  }

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(5000);
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await page.waitForTimeout(500); await btn.click(); } } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 제목
  await page.click('.se-documentTitle .se-text-paragraph');
  await page.waitForTimeout(300);
  await page.keyboard.type("발행 버튼 테스트", { delay: 80 });
  await page.waitForTimeout(500);

  // 발행 팝업 열기
  console.log("=== 발행 팝업 열기 ===");
  const headerBtns = await page.$$('button');
  for (const btn of headerBtns) {
    const text = (await btn.textContent() || "").trim();
    if (await btn.isVisible() && text === "발행") {
      const cls = (await btn.getAttribute("class") || "");
      console.log(`발행 버튼 클릭: class="${cls.slice(0, 60)}"`);
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  // 팝업 내부 모든 버튼 분석
  console.log("\n=== 팝업 열린 후 모든 버튼 ===");
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = (await btn.textContent() || "").trim();
    const cls = (await btn.getAttribute("class") || "").slice(0, 80);
    const visible = await btn.isVisible();
    if (visible && (text.includes("발행") || cls.includes("publish") || cls.includes("confirm"))) {
      console.log(`  text="${text}" class="${cls}"`);
    }
  }

  // 발행 설정 영역(publish_wrap) 내부 DOM 분석
  console.log("\n=== 발행 설정 영역 분석 ===");
  const publishArea = await page.$$eval('[class*="publish"], [class*="setting"]', els =>
    els.filter(el => (el as HTMLElement).offsetHeight > 0)
      .map(el => `<${el.tagName} class="${el.className?.toString().slice(0, 80)}">`)
      .slice(0, 15)
  );
  publishArea.forEach(e => console.log(`  ${e}`));

  // 발행 확인 버튼의 정확한 위치
  console.log("\n=== '발행' 텍스트 포함 visible 버튼 (좌표 포함) ===");
  for (const btn of allBtns) {
    const text = (await btn.textContent() || "").trim();
    if (!await btn.isVisible() || !text.includes("발행")) continue;
    const box = await btn.boundingBox();
    const cls = (await btn.getAttribute("class") || "").slice(0, 60);
    console.log(`  text="${text}" x=${box?.x?.toFixed(0)} y=${box?.y?.toFixed(0)} w=${box?.width?.toFixed(0)} h=${box?.height?.toFixed(0)} class="${cls}"`);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-publish-btns-${Date.now()}.png`) });

  await page.waitForTimeout(5000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
