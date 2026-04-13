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
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  };
  if (fs.existsSync(STORAGE_PATH)) contextOpts.storageState = STORAGE_PATH;

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(4000);

  // 팝업 닫기
  try { const btn = await page.waitForSelector('button:has-text("취소")', { timeout: 3000 }); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 본문에 테스트 텍스트 입력
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl) { await bodyEl.click(); await page.waitForTimeout(300); }
  await page.keyboard.type("테스트 소제목입니다", { delay: 80 });
  await page.waitForTimeout(500);

  // 텍스트 선택
  await page.evaluate(() => {
    const editor = document.querySelector('.se-content');
    if (!editor) return;
    const paragraphs = editor.querySelectorAll('p.se-text-paragraph');
    for (const p of paragraphs) {
      if (p.textContent?.includes("테스트 소제목")) {
        const range = document.createRange();
        range.selectNodeContents(p);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // === 글자크기 버튼 클릭 후 팝업 DOM 분석 ===
  console.log("\n=== 글자크기 디버그 ===");
  const fontSizeBtn = await page.$('button[data-name="font-size"]');
  if (fontSizeBtn && await fontSizeBtn.isVisible()) {
    await fontSizeBtn.click();
    await page.waitForTimeout(1000);

    // 팝업 DOM 분석
    const popupHTML = await page.evaluate(() => {
      // 가장 최근에 열린 팝업/드롭다운 찾기
      const popups = document.querySelectorAll('[class*="popup"], [class*="layer"], [class*="drop"], [class*="select"]');
      const visible: string[] = [];
      popups.forEach(p => {
        const el = p as HTMLElement;
        if (el.offsetHeight > 0 && el.innerHTML.length < 5000) {
          visible.push(`<${el.tagName} class="${el.className}">\n${el.innerHTML.slice(0, 500)}`);
        }
      });
      return visible;
    });
    console.log("열린 팝업들:");
    popupHTML.forEach((h, i) => console.log(`  [${i}]`, h.slice(0, 300)));

    // 모든 visible 요소 중 숫자가 있는 것 찾기
    const sizeElements = await page.$$eval('*', (els) => {
      return els
        .filter(el => {
          const h = el as HTMLElement;
          return h.offsetHeight > 0 && /^(1[0-9]|2[0-9]|3[0-9]|[4-9][0-9])$/.test(h.textContent?.trim() || "");
        })
        .map(el => `<${el.tagName} class="${el.className?.toString().slice(0, 80)}"> text="${el.textContent?.trim()}"`)
        .slice(0, 20);
    });
    console.log("\n글자크기 숫자 요소들:");
    sizeElements.forEach(s => console.log(`  ${s}`));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-fontsize-${Date.now()}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else {
    console.log("글자크기 버튼 없음");
  }

  // === 글자색 버튼 클릭 후 팝업 DOM 분석 ===
  console.log("\n=== 글자색 디버그 ===");
  // 다시 선택
  await page.evaluate(() => {
    const editor = document.querySelector('.se-content');
    if (!editor) return;
    const paragraphs = editor.querySelectorAll('p.se-text-paragraph');
    for (const p of paragraphs) {
      if (p.textContent?.includes("테스트 소제목")) {
        const range = document.createRange();
        range.selectNodeContents(p);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  const colorBtn = await page.$('button[data-name="font-color"]');
  if (colorBtn && await colorBtn.isVisible()) {
    await colorBtn.click();
    await page.waitForTimeout(1000);

    // input 요소 분석
    const inputs = await page.$$eval('input', (els) => {
      return els
        .filter(el => (el as HTMLElement).offsetHeight > 0)
        .map(el => `<input type="${el.type}" class="${el.className?.slice(0, 80)}" placeholder="${el.placeholder}" maxlength="${el.maxLength}" value="${el.value}">`)
        .slice(0, 20);
    });
    console.log("보이는 input들:");
    inputs.forEach(s => console.log(`  ${s}`));

    // 색상 팔레트 셀 분석
    const colorCells = await page.$$eval('[class*="color"], [class*="palette"], [class*="swatch"]', (els) => {
      return els
        .filter(el => (el as HTMLElement).offsetHeight > 0 && (el as HTMLElement).offsetHeight < 50)
        .map(el => {
          const style = (el as HTMLElement).style;
          return `<${el.tagName} class="${el.className?.toString().slice(0, 60)}" bg="${style.backgroundColor}" data="${el.getAttribute("data-color") || el.getAttribute("data-value") || ""}">`;
        })
        .slice(0, 30);
    });
    console.log("\n색상 셀들:");
    colorCells.forEach(s => console.log(`  ${s}`));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-fontcolor-${Date.now()}.png`) });
  } else {
    console.log("글자색 버튼 없음");
  }

  await page.waitForTimeout(3000);
  await context.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
