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

  // 팝업 닫기
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await page.waitForTimeout(500); await btn.click(); } } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 제목 입력 (발행하려면 제목 필수)
  const titleSel = '.se-documentTitle .se-text-paragraph';
  await page.waitForSelector(titleSel, { timeout: 10000 });
  await page.click(titleSel);
  await page.waitForTimeout(300);
  await page.keyboard.type("카테고리 태그 테스트", { delay: 80 });
  await page.waitForTimeout(500);

  // 발행 버튼 클릭 — 발행 설정 팝업 열기
  console.log("\n=== 발행 버튼 클릭 ===");
  const publishBtns = await page.$$('button');
  for (const btn of publishBtns) {
    const text = (await btn.textContent() || "").trim();
    const visible = await btn.isVisible();
    if (visible && text === "발행") {
      console.log("발행 버튼 클릭");
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  // 발행 설정 팝업 분석
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-publish-popup-${Date.now()}.png`) });

  console.log("\n=== 발행 팝업 DOM 분석 ===");

  // 카테고리 관련
  const allVisible = await page.$$eval('*', els =>
    els.filter(el => {
      const h = el as HTMLElement;
      return h.offsetHeight > 0 && (
        h.className?.toString().includes('cate') ||
        h.className?.toString().includes('category') ||
        h.textContent?.trim() === '카테고리' ||
        h.className?.toString().includes('tag') ||
        h.className?.toString().includes('hashtag') ||
        h.getAttribute?.('placeholder')?.includes('태그')
      );
    }).map(el => {
      const h = el as HTMLElement;
      return `<${el.tagName} class="${el.className?.toString().slice(0, 80)}"> text="${el.textContent?.trim().slice(0, 40)}" placeholder="${(el as HTMLInputElement).placeholder || ""}"`;
    }).slice(0, 30)
  );
  console.log("카테고리/태그 요소:");
  allVisible.forEach(e => console.log(`  ${e}`));

  // select 요소
  const selects = await page.$$('select');
  console.log(`\nselect 요소 ${selects.length}개:`);
  for (const sel of selects) {
    const visible = await sel.isVisible();
    const cls = (await sel.getAttribute("class") || "").slice(0, 60);
    if (visible) {
      const options = await sel.$$eval('option', opts => opts.map(o => o.textContent?.trim()).slice(0, 10));
      console.log(`  class="${cls}" options: ${JSON.stringify(options)}`);
    }
  }

  // input 요소
  const inputs = await page.$$('input');
  console.log(`\n보이는 input 요소:`);
  for (const inp of inputs) {
    const visible = await inp.isVisible();
    if (!visible) continue;
    const type = await inp.getAttribute("type");
    const placeholder = await inp.getAttribute("placeholder");
    const cls = (await inp.getAttribute("class") || "").slice(0, 60);
    console.log(`  type="${type}" placeholder="${placeholder}" class="${cls}"`);
  }

  await page.waitForTimeout(5000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
