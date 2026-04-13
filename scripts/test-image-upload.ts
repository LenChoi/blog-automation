import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

// 기존 article 19의 이미지 URL
const testImageUrl = "https://pub-63d7c2589b7d4e77942e15d585e3236f.r2.dev/blog/2026/04/11/병문안-꽃다발-예절-mid-1775838973691.png";

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--window-position=100,100",
      "--window-size=1280,900",
    ],
  });

  const contextOpts: any = {
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  };
  if (fs.existsSync(STORAGE_PATH)) {
    contextOpts.storageState = STORAGE_PATH;
  }

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // 1. 글쓰기 페이지 이동
  console.log("[Test] 글쓰기 페이지 이동...");
  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.waitForTimeout(4000);

  // 2. 작성중 팝업 닫기
  try {
    const cancelBtn = await page.waitForSelector('button:has-text("취소")', { timeout: 3000 });
    if (cancelBtn && await cancelBtn.isVisible()) {
      console.log("[Test] 작성중 팝업 → 취소");
      await cancelBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  // 도움말 닫기
  for (const sel of ['.se-help-panel-close-button', '.se-guide-close', 'button:has-text("닫기")']) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        console.log(`[Test] 팝업 닫기: ${sel}`);
        await btn.click();
        await page.waitForTimeout(500);
      }
    } catch {}
  }

  // 3. 이미지 다운로드
  console.log("[Test] 이미지 다운로드...");
  const resp = await fetch(testImageUrl);
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const localPath = path.join(SCREENSHOT_DIR, `test-upload-${Date.now()}.png`);
  fs.writeFileSync(localPath, buffer);
  console.log(`[Test] 이미지 저장: ${localPath} (${buffer.length} bytes)`);

  // 4. 본문 영역 클릭
  const bodyEl = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (bodyEl && await bodyEl.isVisible()) {
    await bodyEl.click();
    await page.waitForTimeout(500);
  }

  // 5. 사진 버튼 찾기 — 일단 모든 버튼의 정보를 출력
  console.log("[Test] 에디터 툴바 버튼 탐색...");
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const ariaLabel = await btn.getAttribute("aria-label");
    const dataName = await btn.getAttribute("data-name");
    const className = await btn.getAttribute("class");
    const visible = await btn.isVisible();
    if (visible && (ariaLabel || dataName)) {
      console.log(`  버튼: aria="${ariaLabel}", data-name="${dataName}", class="${(className || "").slice(0, 60)}"`);
    }
  }

  // 6. 이미지 버튼 클릭 + filechooser 대기
  console.log("\n[Test] 이미지 업로드 시도...");

  // 방법 1: filechooser 이벤트
  const photoBtnSelectors = [
    'button[data-name="image"]',
    'button[aria-label*="사진"]',
    'button[aria-label*="이미지"]',
    '.se-toolbar-button-image',
  ];

  let photoBtn = null;
  for (const sel of photoBtnSelectors) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      photoBtn = btn;
      console.log(`[Test] 사진 버튼 발견: ${sel}`);
      break;
    }
  }

  if (!photoBtn) {
    // aria-label 기반 탐색
    for (const btn of buttons) {
      const ariaLabel = await btn.getAttribute("aria-label");
      if (ariaLabel && (ariaLabel.includes("사진") || ariaLabel.includes("이미지") || ariaLabel.includes("photo") || ariaLabel.includes("image"))) {
        if (await btn.isVisible()) {
          photoBtn = btn;
          console.log(`[Test] 사진 버튼 발견 (aria): "${ariaLabel}"`);
          break;
        }
      }
    }
  }

  if (photoBtn) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10000 }).catch((e) => {
        console.log("[Test] filechooser 이벤트 미감지:", e.message.slice(0, 100));
        return null;
      }),
      photoBtn.click(),
    ]);

    if (fileChooser) {
      console.log("[Test] filechooser 감지! 파일 업로드 중...");
      await fileChooser.setFiles(localPath);
      await page.waitForTimeout(5000);
      console.log("[Test] 업로드 완료!");
    } else {
      console.log("[Test] filechooser 미감지 — 스크린샷 저장...");
    }
  } else {
    console.log("[Test] 사진 버튼을 찾지 못함");
  }

  // 7. 스크린샷
  const shot = path.join(SCREENSHOT_DIR, `test-image-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`[Test] 스크린샷: ${shot}`);

  // 파일 정리
  try { fs.unlinkSync(localPath); } catch {}

  await page.waitForTimeout(3000);
  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
