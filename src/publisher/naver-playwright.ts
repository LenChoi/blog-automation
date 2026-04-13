import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "path";
import fs from "fs";
import type { EditorCommand } from "../engine/formatter.js";
import {
  humanDelay,
  humanClick,
  humanType,
  humanFill,
  humanTypeBody,
  humanScroll,
  maybeRest,
} from "./human-delay.js";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

export interface NaverPublishInput {
  commands: EditorCommand[];
  title: string;
  blogCategory?: string;
  hashtags?: string[];
}

export interface PublishResult {
  success: boolean;
  screenshotPath?: string;
  publishedUrl?: string;
  error?: string;
}

/** 저장된 로그인 세션으로 브라우저 컨텍스트 생성 */
async function createContext(browser: Browser): Promise<BrowserContext> {
  const contextOpts: Parameters<Browser["newContext"]>[0] = {
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  };

  if (fs.existsSync(STORAGE_PATH)) {
    contextOpts.storageState = STORAGE_PATH;
  }

  return browser.newContext(contextOpts);
}

/** 로그인 상태 확인 — 로그인 안 되어있으면 false */
async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(`https://blog.naver.com/${BLOG_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    // 로그인된 상태면 글쓰기 버튼이 보임
    const writeBtn = await page.$('a[href*="postwrite"], .blog_menu .write');
    return !!writeBtn;
  } catch {
    return false;
  }
}

/** 세션 저장 */
async function saveSession(context: BrowserContext): Promise<void> {
  const dir = path.dirname(STORAGE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: STORAGE_PATH });
}

function extractImageUrls(commands: EditorCommand[]): string[] {
  return (commands || [])
    .filter((cmd) => cmd.type === "image" && cmd.path)
    .map((cmd) => cmd.path!);
}

/** 마크다운에서 소제목(##), 하위제목(###), 볼드(**) 추출 */
function parseContent(retouched: string) {
  const headings: string[] = [];
  const subHeadings: string[] = [];
  const boldKeywords: string[] = [];

  for (const line of retouched.split("\n")) {
    const h2 = line.trim().match(/^##\s+(.+)$/);
    if (h2) headings.push(h2[1]);
    const h3 = line.trim().match(/^###\s+(.+)$/);
    if (h3) subHeadings.push(h3[1]);
  }

  for (const m of retouched.matchAll(/\*\*(.+?)\*\*/g)) {
    if (!boldKeywords.includes(m[1])) boldKeywords.push(m[1]);
  }

  return { headings, subHeadings, boldKeywords };
}

/** 마크다운 서식 제거 (에디터에 입력할 플레인 텍스트) */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#\s+.+$/m, "") // 제목(h1) 제거
    .replace(/^###\s+/gm, "")
    .replace(/^##\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\[IMAGE_(TOP|MID|BOTTOM)\]$/gm, "")
    .replace(/^---$/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 도움말, 임시저장 복원 등 모든 팝업/패널 닫기 */
async function closePopups(page: Page): Promise<void> {
  const selectors = [
    // 도움말 패널
    '.se-help-panel-close-button',
    '.se-guide-close',
    '.help_btn.is_active',
    '.tooltip_layer .btn_close',
    // 임시저장/작성중 복원 팝업
    'button:has-text("아니오")',
    'button:has-text("아니요")',
    'button.se-popup-button-cancel',
    '.se-popup-button-cancel',
    // 기타 팝업
    '.se-popup-close-button',
    'button:has-text("닫기")',
  ];
  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        console.log(`[Naver-PW] 팝업 닫기: ${sel}`);
        await btn.click();
        await humanDelay(300, 500);
      }
    } catch {}
  }
}

/** 에디터 내에서 텍스트를 찾아 선택 (Ctrl+H 대체용) */
async function findAndSelect(page: Page, text: string): Promise<boolean> {
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  // 네이버 에디터 찾기: Ctrl+F
  await page.keyboard.press(`${mod}+f`);
  await humanDelay(500, 800);

  // 찾기 입력란에 텍스트 입력
  const searchInput = await page.$('.se-find-replace-input input, .se-popup-find input, input[type="text"]:focus');
  if (searchInput) {
    await searchInput.fill(text);
    await humanDelay(300, 500);
    await page.keyboard.press("Enter");
    await humanDelay(300, 500);
    // 찾기 닫기
    await page.keyboard.press("Escape");
    await humanDelay(200, 400);

    // 찾은 텍스트를 드래그로 선택
    await page.keyboard.press(`${mod}+f`);
    await humanDelay(300, 500);
    if (await page.$('.se-find-replace-input input, .se-popup-find input')) {
      const input = await page.$('.se-find-replace-input input, .se-popup-find input');
      if (input) {
        await input.fill(text);
        await humanDelay(200, 300);
      }
    }
    await page.keyboard.press("Escape");
    return true;
  }
  await page.keyboard.press("Escape");
  return false;
}

/** 스크린샷 저장 */
async function takeScreenshot(page: Page, name: string): Promise<string> {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

// ─────────────────────────────────────────
// 메인 발행 함수
// ─────────────────────────────────────────

export async function publishToNaverPlaywright(
  input: NaverPublishInput,
  retouched?: string,
): Promise<PublishResult> {
  const content = retouched || "";
  const imageUrls = extractImageUrls(input.commands);
  const hashtags = input.hashtags || [];
  const { headings, subHeadings, boldKeywords } = parseContent(content);
  const plainText = stripMarkdown(content);

  console.log(
    `[Naver-PW] 발행 시작: "${input.title}" (${content.length}자, 이미지 ${imageUrls.length}장)`,
  );

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--window-position=100,100",
      "--window-size=1280,900",
    ],
  });

  let screenshotPath: string | undefined;

  try {
    const context = await createContext(browser);
    const page = await context.newPage();

    // webdriver 프로퍼티 제거 (봇 탐지 회피)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // === 1. 로그인 확인 ===
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      console.log("[Naver-PW] 로그인 필요 — 수동 로그인 대기 (10초)");
      await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "domcontentloaded" });
      // 수동 로그인 대기
      await page.waitForURL(`**/blog.naver.com/**`, { timeout: 10000 }).catch(() => {});
      await saveSession(context);
      console.log("[Naver-PW] 로그인 세션 저장 완료");
    }

    // === 2. 글쓰기 페이지 이동 ===
    await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await humanDelay(4000, 5000);

    // === 2-1. 작성중 복원 팝업 대기 + 도움말 닫기 (가장 먼저) ===
    console.log("[Naver-PW] 팝업/도움말 닫기...");
    try {
      const cancelBtn = await page.waitForSelector(
        'button.se-popup-button-cancel',
        { timeout: 5000 },
      );
      if (cancelBtn && await cancelBtn.isVisible()) {
        await humanDelay(500, 800);
        await cancelBtn.click();
        console.log("[Naver-PW] 작성중 복원 팝업 → 취소 클릭");
        await humanDelay(1000, 1500);
      }
    } catch {}
    await closePopups(page);

    // === 2-2. 토글 버튼 초기화 (취소선 등이 켜져있으면 해제) ===
    for (const name of ['strikethrough', 'bold', 'italic', 'underline']) {
      const btn = await page.$(`button[data-name="${name}"]`);
      if (btn) {
        const cls = await btn.getAttribute("class") || "";
        if (cls.includes("se-is-selected") || cls.includes("se-is-activated")) {
          console.log(`[Naver-PW] ${name} 활성 → 해제`);
          await btn.click();
          await humanDelay(200, 300);
        }
      }
    }

    // === 3. 제목 입력 (clipboard paste — contenteditable 충돌 방지) ===
    console.log("[Naver-PW] 제목 입력...");
    const titleSelector = '.se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph';
    await page.waitForSelector(titleSelector, { timeout: 10000 });
    await humanFill(page, titleSelector, input.title);
    await humanDelay(500, 1000);

    // === 4. 카테고리 선택 ===
    if (input.blogCategory) {
      console.log(`[Naver-PW] 카테고리 선택: ${input.blogCategory}`);
      const categoryBtn = await page.$('.blog2_post_function .category, .post_set .category_btn, button:has-text("카테고리")');
      if (categoryBtn) {
        await categoryBtn.click();
        await humanDelay(500, 1000);
        const categoryItem = await page.$(`text="${input.blogCategory}"`);
        if (categoryItem) {
          await categoryItem.click();
          await humanDelay(500, 800);
        }
      }
    }

    // === 5. 본문 영역 클릭 ===
    console.log("[Naver-PW] 본문 영역 진입...");
    // 제목과 본문 모두 .se-text-paragraph를 쓰므로,
    // 본문 전용 컨테이너(.se-content)의 첫 번째 텍스트 영역을 직접 클릭
    const bodySelectors = [
      '.se-content .se-component:not(.se-documentTitle) .se-text-paragraph',
      '.se-main-container .se-section-text .se-text-paragraph',
      '.se-content .se-section-text p',
    ];
    let bodyClicked = false;
    for (const sel of bodySelectors) {
      const bodyEl = await page.$(sel);
      if (bodyEl) {
        const visible = await bodyEl.isVisible();
        if (visible) {
          await bodyEl.click();
          bodyClicked = true;
          console.log(`[Naver-PW] 본문 영역 클릭 성공: ${sel}`);
          break;
        }
      }
    }
    // 셀렉터 모두 실패 시 — 에디터 중앙 영역 좌표 클릭 (제목 아래)
    if (!bodyClicked) {
      console.log("[Naver-PW] 셀렉터 실패, 좌표 기반 본문 클릭...");
      await page.mouse.click(640, 400);
    }
    await humanDelay(500, 1000);

    // === 6. 본문 입력 (한 글자씩 타이핑 — 400타/분) ===
    await humanTypeBody(page, plainText);
    await humanDelay(1000, 2000);

    // === 6-1. 입력 검토 — 스크린샷으로 제목/본문 확인 ===
    console.log("[Naver-PW] 입력 검토 중...");
    await humanScroll(page, "up", 2000);
    await humanDelay(500, 1000);
    const reviewShot = await takeScreenshot(page, "naver-input-review");
    console.log(`[Naver-PW] 입력 검토 스크린샷: ${reviewShot}`);

    // === 7. 이미지 삽입 (filechooser 이벤트 사용) ===
    for (let i = 0; i < imageUrls.length; i++) {
      console.log(`[Naver-PW] 이미지 ${i + 1}/${imageUrls.length} 삽입...`);

      // 이미지 URL → 로컬 임시 파일로 다운로드
      let localPath = imageUrls[i];
      if (imageUrls[i].startsWith("http")) {
        try {
          const resp = await fetch(imageUrls[i]);
          const buffer = Buffer.from(await resp.arrayBuffer());
          if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
          localPath = path.join(SCREENSHOT_DIR, `upload-${Date.now()}-${i}.png`);
          fs.writeFileSync(localPath, buffer);
        } catch (e) {
          console.warn(`[Naver-PW] 이미지 ${i + 1} 다운로드 실패:`, e);
          continue;
        }
      }

      // filechooser 이벤트 리스너 등록 후 사진 버튼 클릭
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null),
        (async () => {
          // 사진 버튼 찾기 — 여러 셀렉터 시도
          const photoBtnSelectors = [
            'button[data-name="image"]',
            '.se-toolbar-button-image',
            '.se-image-toolbar-button',
            'button.se-toolbar-button:has(.se-toolbar-icon-image)',
          ];
          for (const sel of photoBtnSelectors) {
            const btn = await page.$(sel);
            if (btn && await btn.isVisible()) {
              await btn.click();
              return;
            }
          }
          // 셀렉터 실패 시 텍스트 기반
          const allBtns = await page.$$('button');
          for (const btn of allBtns) {
            const ariaLabel = await btn.getAttribute("aria-label");
            if (ariaLabel && (ariaLabel.includes("사진") || ariaLabel.includes("이미지"))) {
              if (await btn.isVisible()) { await btn.click(); return; }
            }
          }
        })(),
      ]);

      if (fileChooser) {
        await fileChooser.setFiles(localPath);
        console.log(`[Naver-PW] 이미지 ${i + 1} 업로드 완료`);
        await humanDelay(3000, 5000); // 업로드 처리 대기
      } else {
        console.warn(`[Naver-PW] 이미지 ${i + 1} filechooser 미감지`);
      }

      // 임시 파일 정리
      if (localPath !== imageUrls[i]) {
        setTimeout(() => { try { fs.unlinkSync(localPath); } catch {} }, 10000);
      }
    }

    // === 8~10. 서식 적용 (마우스 드래그로 텍스트 선택) ===

    /** 텍스트가 포함된 <p>의 bounding rect 반환 */
    async function getLineRect(textToFind: string) {
      return page.evaluate((searchText) => {
        const editor = document.querySelector('.se-content');
        if (!editor) return null;
        for (const p of editor.querySelectorAll('p.se-text-paragraph')) {
          if (p.textContent?.includes(searchText)) {
            p.scrollIntoView({ block: 'center' });
            const rect = p.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }
        }
        return null;
      }, textToFind);
    }

    /** 특정 텍스트의 bounding rect 반환 (Range API) */
    async function getTextRect(textToFind: string) {
      return page.evaluate((searchText) => {
        const editor = document.querySelector('.se-content');
        if (!editor) return null;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          const idx = node.textContent?.indexOf(searchText) ?? -1;
          if (idx >= 0) {
            (node.parentElement as HTMLElement)?.scrollIntoView({ block: 'center' });
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
      await humanDelay(50, 100);
      await page.mouse.down();
      await humanDelay(30, 60);
      await page.mouse.move(endX, endY, { steps: 10 });
      await humanDelay(50, 100);
      await page.mouse.up();
      await humanDelay(200, 400);
    }

    // === 8. 소제목 서식 (## → 볼드 + 크게 + 초록) ===
    for (const heading of headings) {
      console.log(`[Naver-PW] 소제목 서식: "${heading.slice(0, 20)}..."`);
      await humanDelay(200, 400);
      let rect = await getLineRect(heading);
      if (!rect) continue;
      await humanDelay(200, 300);
      rect = await getLineRect(heading); // 스크롤 후 좌표 갱신
      if (!rect) continue;

      // 한 번만 드래그 → 서식 3개 연달아 적용 (재드래그하면 이전 서식 리셋됨)
      await dragSelect(rect);

      // 1. 글자크기 24
      const fontSizeBtn = await page.$('button[data-name="font-size"]');
      if (fontSizeBtn && await fontSizeBtn.isVisible()) {
        await fontSizeBtn.click();
        await humanDelay(300, 500);
        const fs24 = await page.$('button[class*="fs24"]');
        if (fs24 && await fs24.isVisible()) {
          await fs24.click();
          console.log(`[Naver-PW] 글자크기 24 적용`);
        } else {
          await page.keyboard.press("Escape");
        }
        await humanDelay(200, 400);
      }

      // 2. 볼드
      const boldBtn = await page.$('button[data-name="bold"]');
      if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); await humanDelay(200, 400); }

      // 3. 초록색
      const colorBtn = await page.$('button[data-name="font-color"]');
      if (colorBtn && await colorBtn.isVisible()) {
        await colorBtn.click();
        await humanDelay(300, 500);
        const paletteBtn = await page.$('button.se-color-palette[data-color="#00a84b"]');
        if (paletteBtn && await paletteBtn.isVisible()) {
          await paletteBtn.click();
          console.log(`[Naver-PW] 색상 #00a84b 적용`);
          await humanDelay(200, 400);
        } else {
          await page.keyboard.press("Escape");
        }
      }

      await humanDelay(300, 500);
    }

    // === 9. 하위 제목 (### → 볼드 + 초록) ===
    for (const sub of subHeadings) {
      console.log(`[Naver-PW] 하위 제목 서식: "${sub.slice(0, 20)}..."`);
      await humanDelay(200, 400);
      let rect = await getLineRect(sub);
      if (!rect) continue;
      await humanDelay(200, 300);
      rect = await getLineRect(sub);
      if (!rect) continue;

      // 한 번만 드래그 → 볼드 + 색상 연달아
      await dragSelect(rect);
      const boldBtn = await page.$('button[data-name="bold"]');
      if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); await humanDelay(200, 300); }

      const colorBtn = await page.$('button[data-name="font-color"]');
      if (colorBtn && await colorBtn.isVisible()) {
        await colorBtn.click();
        await humanDelay(300, 500);
        const paletteBtn = await page.$('button.se-color-palette[data-color="#00a84b"]');
        if (paletteBtn && await paletteBtn.isVisible()) {
          await paletteBtn.click();
          await humanDelay(200, 400);
        } else {
          await page.keyboard.press("Escape");
        }
      }
      await humanDelay(300, 500);
    }

    // === 10. 볼드 키워드 서식 ===
    for (const kw of boldKeywords.slice(0, 5)) {
      console.log(`[Naver-PW] 키워드 볼드: "${kw.slice(0, 20)}"`);
      await humanDelay(200, 300);
      let rect = await getTextRect(kw);
      if (!rect) continue;
      await humanDelay(200, 300);
      rect = await getTextRect(kw);
      if (!rect) continue;

      await dragSelect(rect);
      const boldBtn = await page.$('button[data-name="bold"]');
      if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); await humanDelay(200, 400); }
    }

    // === 12. 해시태그 입력 ===
    if (hashtags.length > 0) {
      console.log(`[Naver-PW] 해시태그 ${hashtags.length}개 입력...`);
      const tagInput = await page.$('.se-tag-input input, .tag_input input, input[placeholder*="태그"]');
      if (tagInput) {
        for (const tag of hashtags) {
          await tagInput.click();
          await humanDelay(200, 400);
          await tagInput.fill(tag);
          await humanDelay(200, 400);
          await page.keyboard.press("Enter");
          await humanDelay(300, 700);
        }
      }
    }

    // === 13. 최종 스크린샷 ===
    await humanScroll(page, "up", 1000);
    await humanDelay(500, 1000);
    screenshotPath = await takeScreenshot(page, "naver-pre-publish");
    console.log(`[Naver-PW] 스크린샷 저장: ${screenshotPath}`);

    // === 14. 발행 전 도움말/팝업 다시 닫기 ===
    await closePopups(page);

    // === 15. 발행 ===
    console.log("[Naver-PW] 발행 버튼 클릭...");
    await humanScroll(page, "up", 2000);
    await humanDelay(500, 1000);

    // 페이지의 모든 버튼을 순회하며 "발행" 텍스트가 있는 visible 버튼 찾기
    let publishClicked = false;
    const allBtns = await page.$$('button, a, [role="button"]');
    for (const btn of allBtns) {
      try {
        const text = (await btn.textContent() || "").trim();
        const visible = await btn.isVisible();
        if (visible && text === "발행") {
          console.log(`[Naver-PW] 발행 버튼 발견: "${text}"`);
          await btn.click();
          publishClicked = true;
          await humanDelay(2000, 3000);
          break;
        }
      } catch {}
    }

    if (!publishClicked) {
      console.log("[Naver-PW] 발행 버튼 못 찾음, 디버그 스크린샷 저장...");
      await takeScreenshot(page, "naver-publish-debug");
    }

    if (publishClicked) {
      // 발행 확인 팝업 — 모든 버튼 중 "발행"/"공개" 텍스트 visible 버튼 클릭
      await humanDelay(1000, 2000);
      const popupBtns = await page.$$('button, a, [role="button"]');
      for (const btn of popupBtns) {
        try {
          const text = (await btn.textContent() || "").trim();
          const visible = await btn.isVisible();
          if (visible && (text === "발행" || text.includes("공개 발행") || text === "확인")) {
            console.log(`[Naver-PW] 발행 확인 버튼: "${text}"`);
            await btn.click();
            await humanDelay(3000, 5000);
            break;
          }
        } catch {}
      }
    }

    // === 15. 발행 URL 추출 ===
    await page.waitForTimeout(5000);
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/https?:\/\/blog\.naver\.com\/[^\s)]+/);

    // 세션 저장
    await saveSession(context);

    await context.close();
    await browser.close();

    return {
      success: !!urlMatch,
      screenshotPath,
      publishedUrl: urlMatch ? urlMatch[0] : undefined,
      error: urlMatch ? undefined : "발행 URL 확인 실패",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Naver-PW] 발행 실패: ${msg}`);
    await browser.close();
    return {
      success: false,
      screenshotPath,
      error: msg.slice(0, 300),
    };
  }
}

export async function confirmPublishNaverPlaywright(): Promise<PublishResult> {
  return { success: true };
}
