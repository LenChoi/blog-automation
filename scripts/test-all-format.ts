import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
async function wait(ms: number) { await new Promise(r => setTimeout(r, ms)); }

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
  await wait(5000);

  // 팝업 닫기
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await wait(500); await btn.click(); console.log("팝업 취소"); } } catch {}
  await wait(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) { await btn.click(); console.log("도움말 닫기"); } } catch {}
  await wait(500);

  // 토글 초기화
  for (const name of ['strikethrough', 'bold', 'italic', 'underline']) {
    const btn = await page.$(`button[data-name="${name}"]`);
    if (btn) { const cls = await btn.getAttribute("class") || ""; if (cls.includes("se-is-selected")) { await btn.click(); await wait(200); } }
  }

  // === 유틸 ===

  async function insertQuotation(style: string) {
    const dropdown = await page.$('.se-document-toolbar-select-option-button[data-name="quotation"]');
    if (dropdown && await dropdown.isVisible()) {
      await dropdown.click();
      await wait(800);
      const styleBtn = await page.$(`button[class*="quotation_${style}"], button[class*="quotation-${style}"]`);
      if (styleBtn && await styleBtn.isVisible()) {
        await styleBtn.click();
        console.log(`  인용구 ${style} 삽입`);
        await wait(1000);
        return true;
      }
      await page.keyboard.press("Escape");
    }
    return false;
  }

  async function escapeQuotation() {
    const pos = await page.evaluate(() => {
      const qs = document.querySelectorAll('.se-section-quotation, .se-component-quotation');
      const last = qs[qs.length - 1] as HTMLElement;
      if (!last) return null;
      const r = last.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height + 20 };
    });
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      await wait(500);
    }
  }

  async function insertHr() {
    const btn = await page.$('button[data-name="horizontal-line"]');
    if (btn && await btn.isVisible()) { await btn.click(); await wait(1000); }
  }

  async function setAlign(align: "left" | "center") {
    const btn = await page.$('button[data-name="align-drop-down-with-justify"]');
    if (btn && await btn.isVisible()) {
      await btn.click();
      await wait(500);
      const opt = await page.$(`button[class*="align-${align}"]`);
      if (opt && await opt.isVisible()) { await opt.click(); await wait(300); }
      else { await page.keyboard.press("Escape"); }
    }
  }

  async function dragSelect(rect: { x: number; y: number; width: number; height: number }) {
    await page.mouse.move(rect.x + 2, rect.y + rect.height / 2, { steps: 5 });
    await wait(100);
    await page.mouse.down();
    await wait(50);
    await page.mouse.move(rect.x + rect.width - 2, rect.y + rect.height / 2, { steps: 10 });
    await wait(100);
    await page.mouse.up();
    await wait(300);
  }

  async function getTextRect(text: string) {
    return page.evaluate((t) => {
      const editor = document.querySelector('.se-content');
      if (!editor) return null;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const idx = node.textContent?.indexOf(t) ?? -1;
        if (idx >= 0) {
          (node.parentElement as HTMLElement)?.scrollIntoView({ block: 'center' });
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + t.length);
          const r = range.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
      return null;
    }, text);
  }

  // =============================================
  // [1] 제목
  // =============================================
  console.log("\n[1] 제목");
  await page.click('.se-documentTitle .se-text-paragraph');
  await wait(500);
  await page.keyboard.type("근조화환 문구 총정리 처음 보내는 분 필독", { delay: rand(80, 130) });
  await wait(500);

  // 본문 진입
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl && await bodyEl.isVisible()) { await bodyEl.click(); await wait(500); }

  // =============================================
  // [2] 스티커 (가운데 정렬)
  // =============================================
  console.log("\n[2] 스티커 (가운데 정렬)");
  await setAlign("center");
  const stickerBtn = await page.$('button[data-name="sticker"]');
  if (stickerBtn && await stickerBtn.isVisible()) {
    await stickerBtn.click();
    await wait(2000);
    const sticker = await page.$('button.se-sidebar-element-sticker');
    if (sticker && await sticker.isVisible()) {
      await sticker.click();
      console.log("  스티커 삽입");
      await wait(2000);
    }
    // 패널 닫기
    const stickerBtn2 = await page.$('button[data-name="sticker"]');
    if (stickerBtn2 && await stickerBtn2.isVisible()) { await stickerBtn2.click(); await wait(500); }
  }
  await page.keyboard.press("Enter");
  await wait(300);

  // =============================================
  // [3] 인트로 (가운데 정렬 유지)
  // =============================================
  console.log("\n[3] 인트로 (가운데 정렬)");
  await page.keyboard.type("얼마 전 직장 동료의 부친상 소식을 듣고 급하게 근조화환을 보내야 했다.", { delay: rand(70, 130) });
  await page.keyboard.press("Enter"); await wait(150);
  await page.keyboard.type("꽃집에 전화해서 하나하나 물어보면서 알게 된 것들을 정리해 본다.", { delay: rand(70, 130) });
  await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await wait(300);

  // 왼쪽 정렬 복원
  await setAlign("left");
  await wait(300);

  // =============================================
  // [4] 대표주제 (인용구4=underline)
  // =============================================
  console.log("\n[4] 대표주제 (인용구4 underline)");
  await insertQuotation("underline");
  await page.keyboard.type("근조화환 문구, 왜 중요할까?", { delay: rand(70, 130) });
  await wait(500);

  // 대표주제 서식: 크기24 + #007433
  let mainRect = await getTextRect("근조화환 문구, 왜 중요할까?");
  await wait(300);
  mainRect = await getTextRect("근조화환 문구, 왜 중요할까?");
  if (mainRect) {
    await dragSelect(mainRect);
    // 크기24
    const fsBtn = await page.$('button[data-name="font-size"]');
    if (fsBtn && await fsBtn.isVisible()) {
      await fsBtn.click(); await wait(500);
      const fs24 = await page.$('button[class*="fs24"]');
      if (fs24 && await fs24.isVisible()) { await fs24.click(); console.log("  크기24"); await wait(300); }
      else { await page.keyboard.press("Escape"); }
    }
    // 색상
    const colorBtn = await page.$('button[data-name="font-color"]');
    if (colorBtn && await colorBtn.isVisible()) {
      await colorBtn.click(); await wait(500);
      const green = await page.$('button.se-color-palette[data-color="#007433"]');
      if (green && await green.isVisible()) { await green.click(); console.log("  #007433"); await wait(300); }
      else { await page.keyboard.press("Escape"); }
    }
  }

  // 인용구 탈출
  await escapeQuotation();
  await page.keyboard.press("Enter");
  await wait(300);

  // =============================================
  // [5] 구분선 (대표주제 아래)
  // =============================================
  console.log("\n[5] 구분선");
  await insertHr();
  await page.keyboard.press("Enter");
  await wait(300);

  // =============================================
  // [6] 대표주제 설명 본문
  // =============================================
  console.log("\n[6] 대표주제 설명 본문");
  await page.keyboard.type("화환은 장례식장 빈소 앞에 배치된다.", { delay: rand(70, 130) });
  await page.keyboard.press("Enter"); await wait(150);
  await page.keyboard.type("조문객과 상주 모두가 보기 때문에 문구가 예절에 맞지 않으면 실례가 될 수 있다.", { delay: rand(70, 130) });
  await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  await wait(300);

  // =============================================
  // [7] 소제목1 (인용구2=line + 볼드 + 크기19)
  // =============================================
  console.log("\n[7] 소제목1 (인용구2 line)");
  await insertQuotation("line");
  await page.keyboard.type("종교별 근조화환 문구 모음", { delay: rand(70, 130) });
  await wait(500);

  // 소제목 서식: 크기19 + 볼드
  let subRect = await getTextRect("종교별 근조화환 문구 모음");
  await wait(300);
  subRect = await getTextRect("종교별 근조화환 문구 모음");
  if (subRect) {
    await dragSelect(subRect);
    const fsBtn = await page.$('button[data-name="font-size"]');
    if (fsBtn && await fsBtn.isVisible()) {
      await fsBtn.click(); await wait(500);
      const fs19 = await page.$('button[class*="fs19"]');
      if (fs19 && await fs19.isVisible()) { await fs19.click(); console.log("  크기19"); await wait(300); }
      else { await page.keyboard.press("Escape"); }
    }
    const boldBtn = await page.$('button[data-name="bold"]');
    if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); console.log("  볼드"); await wait(300); }
  }

  // 인용구 탈출
  await escapeQuotation();
  await page.keyboard.press("Enter");
  await wait(300);

  // =============================================
  // [8] 하위항목 (이모지 + 연두색)
  // =============================================
  console.log("\n[8] 하위항목");
  const subItems = [
    { header: "💡무교 / 종교 무관", items: ["삼가 故人의 冥福을 빕니다", "삼가 위로의 마음을 전합니다"] },
    { header: "💒기독교 / 천주교", items: ["謹弔 (근조)", "弔意 (조의)"] },
  ];

  for (const group of subItems) {
    await page.keyboard.type(group.header, { delay: rand(70, 130) });
    await page.keyboard.press("Enter"); await wait(150);
    for (const item of group.items) {
      await page.keyboard.type(`• ${item}`, { delay: rand(70, 130) });
      await page.keyboard.press("Enter"); await wait(150);
    }
    await page.keyboard.press("Enter"); await wait(150);
  }
  await wait(500);

  // 하위항목 헤더에 연두색 적용
  for (const group of subItems) {
    console.log(`  하위항목 색상: "${group.header}"`);
    await wait(300);
    let rect = await getTextRect(group.header);
    if (!rect) continue;
    await wait(300);
    rect = await getTextRect(group.header);
    if (!rect) continue;
    await dragSelect(rect);
    const colorBtn = await page.$('button[data-name="font-color"]');
    if (colorBtn && await colorBtn.isVisible()) {
      await colorBtn.click(); await wait(500);
      const lime = await page.$('button.se-color-palette[data-color="#54b800"]');
      if (lime && await lime.isVisible()) { await lime.click(); console.log("    연두색 적용"); await wait(300); }
      else { await page.keyboard.press("Escape"); }
    }
  }

  // =============================================
  // [9] 구분선 (소제목1 종료)
  // =============================================
  console.log("\n[9] 소제목1 종료 구분선");
  // 문서 끝으로
  await page.keyboard.press("End");
  for (let i = 0; i < 10; i++) { await page.keyboard.press("ArrowDown"); await wait(30); }
  await page.keyboard.press("Enter");
  await wait(200);
  await insertHr();
  await page.keyboard.press("Enter");
  await wait(300);

  // =============================================
  // [10] 소제목2 (마지막 — 구분선 없음)
  // =============================================
  console.log("\n[10] 소제목2 (마지막)");
  await insertQuotation("line");
  await page.keyboard.type("보내는 사람 이름 쓰는 법", { delay: rand(70, 130) });
  await wait(500);

  let subRect2 = await getTextRect("보내는 사람 이름 쓰는 법");
  await wait(300);
  subRect2 = await getTextRect("보내는 사람 이름 쓰는 법");
  if (subRect2) {
    await dragSelect(subRect2);
    const fsBtn = await page.$('button[data-name="font-size"]');
    if (fsBtn && await fsBtn.isVisible()) {
      await fsBtn.click(); await wait(500);
      const fs19 = await page.$('button[class*="fs19"]');
      if (fs19 && await fs19.isVisible()) { await fs19.click(); console.log("  크기19"); await wait(300); }
      else { await page.keyboard.press("Escape"); }
    }
    const boldBtn = await page.$('button[data-name="bold"]');
    if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); console.log("  볼드"); await wait(300); }
  }

  await escapeQuotation();
  await page.keyboard.press("Enter");
  await wait(300);

  await page.keyboard.type("문구만큼 중요한 게 이름 표기다. 상주가 바로 알아볼 수 있어야 한다.", { delay: rand(70, 130) });
  await wait(300);
  // 마지막 소제목이므로 구분선 없음

  // =============================================
  // 결과 스크린샷
  // =============================================
  await wait(1000);
  await page.evaluate(() => { document.querySelector('.se-content')?.scrollTo(0, 0); });
  await wait(500);
  const shot = path.join(SCREENSHOT_DIR, `test-all-final-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\n결과 스크린샷: ${shot}`);

  await wait(5000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
