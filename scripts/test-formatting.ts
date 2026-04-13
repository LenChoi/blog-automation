import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

const testBody = `장례식 화환 가격, 직접 알아보니 이랬어요

요즘 갑자기 화환을 보내야 할 일이 생겼는데, 가격이 천차만별이라 진짜 고민 많이 했거든요. 그래서 직접 여러 곳 비교해봤어요.

3단 화환이 기본이에요

장례식에서 가장 많이 보이는 게 3단 화환이에요. 가격대는 5만 원에서 8만 원 선이 많았어요. 업체마다 다를 수 있는데 보통 배송비 포함이더라고요.

근조 화환 vs 조화

솔직히 요즘은 조화도 퀄리티가 좋아서 구분이 잘 안 돼요. 생화는 당일 시들 수 있어서 조화를 선택하는 분들도 꽤 있더라고요.

주문할 때 꿀팁

새벽이나 당일 배송이 필요하면 추가 비용이 붙을 수 있어요. 미리 주문하는 게 제일 좋아요.`;

const headings = ["3단 화환이 기본이에요", "근조 화환 vs 조화", "주문할 때 꿀팁"];
const boldKeywords = ["5만 원에서 8만 원", "조화도 퀄리티가 좋아서", "미리 주문하는 게 제일 좋아요"];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--window-position=100,100", "--window-size=1280,900"],
  });
  const contextOpts: any = {
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR", timezoneId: "Asia/Seoul",
  };
  if (fs.existsSync(STORAGE_PATH)) contextOpts.storageState = STORAGE_PATH;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  console.log("[Test] 글쓰기 페이지 이동...");
  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(5000);

  // 작성중 팝업 — 뜰 때까지 최대 5초 대기 후 취소
  console.log("[Test] 작성중 팝업 대기...");
  try {
    const cancelBtn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 });
    if (cancelBtn && await cancelBtn.isVisible()) {
      await page.waitForTimeout(500);
      await cancelBtn.click();
      console.log("[Test] 작성중 팝업 → 취소 클릭");
      await page.waitForTimeout(1000);
    }
  } catch { console.log("[Test] 작성중 팝업 없음"); }

  // 도움말 닫기
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) { console.log("[Test] 도움말 닫기"); await btn.click(); } } catch {}
  await page.waitForTimeout(500);

  // === 취소선 등 토글 버튼 상태 초기화 (본문 타이핑 전!) ===
  const toggleButtons = ['strikethrough', 'bold', 'italic', 'underline'];
  for (const name of toggleButtons) {
    const btn = await page.$(`button[data-name="${name}"]`);
    if (btn) {
      const cls = await btn.getAttribute("class") || "";
      if (cls.includes("se-is-selected") || cls.includes("se-is-activated")) {
        console.log(`[Test] ${name} 활성 상태 → 해제`);
        await btn.click();
        await page.waitForTimeout(200);
      }
    }
  }

  // 제목
  console.log("[Test] 제목 입력...");
  const titleSel = '.se-documentTitle .se-text-paragraph';
  await page.waitForSelector(titleSel, { timeout: 10000 });
  await page.click(titleSel);
  await page.waitForTimeout(500);
  await page.keyboard.type("장례식 화환 가격 정리해봤어요", { delay: rand(80, 130) });
  await page.waitForTimeout(500);

  // 본문
  console.log("[Test] 본문 입력...");
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl && await bodyEl.isVisible()) { await bodyEl.click(); await page.waitForTimeout(500); }

  for (const line of testBody.split("\n")) {
    if (line.trim() === "") { await page.keyboard.press("Enter"); await page.waitForTimeout(rand(200, 400)); continue; }
    for (const char of line) { await page.keyboard.type(char, { delay: rand(70, 130) }); }
    await page.waitForTimeout(rand(100, 200));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(rand(150, 350));
  }
  console.log("[Test] 본문 입력 완료");
  await page.waitForTimeout(1000);

  // 입력 확인 스크린샷
  const beforeShot = path.join(SCREENSHOT_DIR, `test-format-before-${Date.now()}.png`);
  await page.screenshot({ path: beforeShot, fullPage: true });
  console.log(`[Test] 서식 전 스크린샷: ${beforeShot}`);

  // ============================================
  // 마우스 드래그로 텍스트 선택 후 서식 적용
  // ============================================

  /**
   * 에디터 본문에서 텍스트가 포함된 <p>의 bounding rect를 반환
   * 마우스 드래그로 줄 전체 선택할 좌표 계산용
   */
  async function getLineRect(textToFind: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return page.evaluate((searchText) => {
      const editor = document.querySelector('.se-content');
      if (!editor) return null;
      const paragraphs = editor.querySelectorAll('p.se-text-paragraph');
      for (const p of paragraphs) {
        if (p.textContent?.includes(searchText)) {
          const rect = p.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
      }
      return null;
    }, textToFind);
  }

  /**
   * 에디터 본문에서 특정 텍스트의 bounding rect를 반환
   * Range API로 정확한 텍스트 범위의 좌표를 얻음
   */
  async function getTextRect(textToFind: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return page.evaluate((searchText) => {
      const editor = document.querySelector('.se-content');
      if (!editor) return null;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const idx = node.textContent?.indexOf(searchText) ?? -1;
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + searchText.length);
          const rect = range.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
      }
      return null;
    }, textToFind);
  }

  /** 마우스 드래그로 영역 선택 */
  async function dragSelect(rect: { x: number; y: number; width: number; height: number }) {
    const startX = rect.x + 2;
    const startY = rect.y + rect.height / 2;
    const endX = rect.x + rect.width - 2;
    const endY = startY;

    await page.mouse.move(startX, startY, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  // === 소제목 서식: 볼드 + 글자크기 24 + 초록 ===
  for (const heading of headings) {
    console.log(`[Test] 소제목 서식: "${heading}"`);
    const rect = await getLineRect(heading);
    if (!rect) { console.log("  줄 못 찾음"); continue; }
    console.log(`  좌표: x=${rect.x.toFixed(0)}, y=${rect.y.toFixed(0)}, w=${rect.width.toFixed(0)}, h=${rect.height.toFixed(0)}`);

    // 스크롤해서 보이게
    await page.evaluate((searchText) => {
      const editor = document.querySelector('.se-content');
      if (!editor) return;
      for (const p of editor.querySelectorAll('p.se-text-paragraph')) {
        if (p.textContent?.includes(searchText)) {
          p.scrollIntoView({ block: 'center' });
          break;
        }
      }
    }, heading);
    await page.waitForTimeout(300);

    // rect 다시 가져오기 (스크롤 후 좌표 변경)
    const rect2 = await getLineRect(heading);
    if (!rect2) continue;

    // 한 번만 드래그 → 볼드 + 글자크기 + 색상 연달아 적용 (재드래그 하면 이전 서식 리셋됨)
    await dragSelect(rect2);

    // 1. 글자크기 24 (먼저 — 크기 변경이 선택 유지에 가장 안정적)
    const fontSizeBtn = await page.$('button[data-name="font-size"]');
    if (fontSizeBtn && await fontSizeBtn.isVisible()) {
      await fontSizeBtn.click();
      await page.waitForTimeout(500);
      const fs24 = await page.$('button[class*="fs24"]');
      if (fs24 && await fs24.isVisible()) {
        await fs24.click();
        console.log("  글자크기 24 적용");
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(300);
    }

    // 2. 볼드
    const boldBtn = await page.$('button[data-name="bold"]');
    if (boldBtn && await boldBtn.isVisible()) {
      await boldBtn.click();
      console.log("  볼드 적용");
      await page.waitForTimeout(300);
    }

    // 3. 초록색
    const colorBtn = await page.$('button[data-name="font-color"]');
    if (colorBtn && await colorBtn.isVisible()) {
      await colorBtn.click();
      await page.waitForTimeout(500);
      const paletteBtn = await page.$('button.se-color-palette[data-color="#00a84b"]');
      if (paletteBtn && await paletteBtn.isVisible()) {
        await paletteBtn.click();
        console.log("  초록색 적용");
        await page.waitForTimeout(300);
      } else {
        await page.keyboard.press("Escape");
      }
    }

    await page.waitForTimeout(500);
  }

  // === 키워드 볼드 ===
  for (const kw of boldKeywords) {
    console.log(`[Test] 키워드 볼드: "${kw}"`);

    // 스크롤
    await page.evaluate((searchText) => {
      const editor = document.querySelector('.se-content');
      if (!editor) return;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent?.includes(searchText)) {
          (node.parentElement as HTMLElement)?.scrollIntoView({ block: 'center' });
          break;
        }
      }
    }, kw);
    await page.waitForTimeout(300);

    const rect = await getTextRect(kw);
    if (!rect) { console.log("  텍스트 못 찾음"); continue; }
    console.log(`  좌표: x=${rect.x.toFixed(0)}, y=${rect.y.toFixed(0)}, w=${rect.width.toFixed(0)}`);

    await dragSelect(rect);

    const boldBtn = await page.$('button[data-name="bold"]');
    if (boldBtn && await boldBtn.isVisible()) {
      await boldBtn.click();
      console.log("  볼드 적용");
      await page.waitForTimeout(300);
    }
  }

  // 결과 스크린샷
  await page.waitForTimeout(1000);
  await page.evaluate(() => { document.querySelector('.se-content')?.scrollTo(0, 0); });
  await page.waitForTimeout(500);
  const afterShot = path.join(SCREENSHOT_DIR, `test-format-result-${Date.now()}.png`);
  await page.screenshot({ path: afterShot, fullPage: true });
  console.log(`[Test] 결과 스크린샷: ${afterShot}`);

  await page.waitForTimeout(5000);
  await context.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
