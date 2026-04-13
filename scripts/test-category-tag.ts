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

  // 로그인 체크
  await page.goto(`https://blog.naver.com/${BLOG_ID}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  const writeBtn = await page.$('a[href*="postwrite"]');
  if (!writeBtn) {
    console.log("로그인 필요");
    await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/blog.naver.com/**`, { timeout: 30000 }).catch(() => {});
    await ctx.storageState({ path: STORAGE_PATH });
  }

  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(5000);

  // 팝업 닫기
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await page.waitForTimeout(500); await btn.click(); } } catch {}
  await page.waitForTimeout(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) await btn.click(); } catch {}
  await page.waitForTimeout(500);

  // 제목 입력
  await page.click('.se-documentTitle .se-text-paragraph');
  await page.waitForTimeout(300);
  await page.keyboard.type("카테고리 태그 테스트", { delay: 80 });
  await page.waitForTimeout(500);

  // === 발행 버튼 클릭 → 발행 설정 팝업 열기 ===
  console.log("\n[1] 발행 팝업 열기");
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = (await btn.textContent() || "").trim();
    if (await btn.isVisible() && text === "발행") {
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  // === 카테고리 변경 ===
  console.log("\n[2] 카테고리 변경");
  const categoryDiv = await page.$('.option_category___kpJc, [class*="option_category"]');
  if (categoryDiv && await categoryDiv.isVisible()) {
    // 카테고리 드롭다운 클릭
    await categoryDiv.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `debug-cate-dropdown-${Date.now()}.png`) });

    // 카테고리 목록 분석
    const cateOptions = await page.$$('[class*="category"] li, [class*="option_list"] li, [class*="select_list"] li, [class*="category_list"] li');
    console.log(`카테고리 옵션 ${cateOptions.length}개:`);
    for (const opt of cateOptions.slice(0, 15)) {
      const text = (await opt.textContent() || "").trim();
      const visible = await opt.isVisible();
      if (visible) console.log(`  "${text}"`);
    }

    // "꽃다발·꽃바구니" 카테고리 선택 시도
    const targetCategory = "꽃다발·꽃바구니";
    for (const opt of cateOptions) {
      const text = (await opt.textContent() || "").trim();
      if (text.includes(targetCategory) || text.includes("꽃다발")) {
        if (await opt.isVisible()) {
          await opt.click();
          console.log(`  카테고리 "${text}" 선택`);
          await page.waitForTimeout(500);
          break;
        }
      }
    }
  }

  // === 태그 입력 (10개) ===
  console.log("\n[3] 태그 입력");
  const tags = ["결혼기념일꽃", "꽃다발추천", "결혼기념일선물", "꽃배달", "꽃선물", "장미꽃다발", "튤립꽃다발", "프리지아", "결혼기념일", "꽃추천"];

  const tagInput = await page.$('input.tag_input__rvUB5, input[placeholder*="태그 입력"]');
  if (tagInput && await tagInput.isVisible()) {
    for (const tag of tags) {
      await tagInput.click();
      await page.waitForTimeout(200);
      await tagInput.fill(tag);
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      console.log(`  태그: "${tag}"`);
    }
  } else {
    console.log("  태그 입력란 못 찾음");
  }

  // 결과 스크린샷
  await page.waitForTimeout(1000);
  const shot = path.join(SCREENSHOT_DIR, `test-cate-tag-result-${Date.now()}.png`);
  await page.screenshot({ path: shot });
  console.log(`\n결과 스크린샷: ${shot}`);

  // 발행하지 않고 종료
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3000);
  await ctx.close();
  await browser.close();
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
