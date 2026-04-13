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

  await page.click('.se-documentTitle .se-text-paragraph');
  await wait(500);
  await page.keyboard.type("커서 테스트", { delay: 80 });
  await wait(500);

  const be = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (be && await be.isVisible()) { await be.click(); await wait(500); }

  // 3줄 입력
  console.log("=== 3줄 입력 ===");
  await page.keyboard.insertText("첫 번째 줄");
  await page.keyboard.press("Enter");
  await wait(300);
  await page.keyboard.insertText("두 번째 줄");
  await page.keyboard.press("Enter");
  await wait(300);
  await page.keyboard.insertText("세 번째 줄 끝");
  await wait(500);

  // 현재 커서 위치 확인
  const beforePos = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "no selection";
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const text = container.textContent || "";
    return `container: "${text.slice(0, 30)}", offset: ${range.startOffset}`;
  });
  console.log(`입력 후 커서: ${beforePos}`);

  // 중간으로 커서 이동 (첫 줄 클릭)
  console.log("\n=== 첫 줄 중간 클릭 ===");
  await page.evaluate(() => {
    const ps = document.querySelectorAll('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph');
    const firstP = ps[0] as HTMLElement;
    if (firstP) {
      const rect = firstP.getBoundingClientRect();
      console.log(`첫 줄 좌표: x=${rect.x}, y=${rect.y}`);
    }
  });

  const firstP = await page.$('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph:first-of-type');
  if (firstP) {
    const box = await firstP.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await wait(300);
      console.log("  첫 줄 중간 클릭 완료");
    }
  }

  const midPos = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "no selection";
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const text = container.textContent || "";
    return `container: "${text.slice(0, 30)}", offset: ${range.startOffset}`;
  });
  console.log(`  커서: ${midPos}`);

  // ==== 방법 1: Cmd+End ====
  console.log("\n=== 방법 1: Cmd+End ===");
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+End`);
  await wait(500);
  const pos1 = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "no selection";
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const text = container.textContent || "";
    return `container: "${text.slice(0, 30)}", offset: ${range.startOffset}`;
  });
  console.log(`  결과: ${pos1}`);

  // ==== 방법 2: 마지막 p 요소의 끝 클릭 ====
  console.log("\n=== 방법 2: 마지막 p 요소 끝 클릭 ===");
  // 다시 중간으로
  if (firstP) {
    const box = await firstP.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(300);
  }

  const pos = await page.evaluate(() => {
    const ps = document.querySelectorAll('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph');
    const last = ps[ps.length - 1] as HTMLElement;
    if (!last) return null;
    last.scrollIntoView({ block: 'end' });
    const rect = last.getBoundingClientRect();
    // 텍스트 오른쪽 끝 클릭 (+ 버튼 회피 위해 x는 중앙)
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  if (pos) {
    console.log(`  마지막 p 좌표: x=${pos.x}, y=${pos.y}`);
    await page.mouse.click(pos.x, pos.y);
    await wait(300);
    await page.keyboard.press("End");
    await wait(300);
  }

  const pos2 = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return "no selection";
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const text = container.textContent || "";
    return `container: "${text.slice(0, 30)}", offset: ${range.startOffset}`;
  });
  console.log(`  결과: ${pos2}`);

  // 확인 — 여기서 타이핑하면 마지막에 추가되어야 함
  await page.keyboard.insertText(" <추가됨>");
  await wait(500);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `cursor-test-${Date.now()}.png`) });

  const final = await page.evaluate(() => {
    const ps = document.querySelectorAll('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph');
    return Array.from(ps).map(p => p.textContent);
  });
  console.log("\n최종 각 줄:");
  final.forEach((t, i) => console.log(`  [${i}] ${t}`));

  await wait(3000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
