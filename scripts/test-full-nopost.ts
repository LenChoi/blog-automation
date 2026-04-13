import { prisma } from "../src/db";
import { runPipelineForBlog } from "../src/scheduler/pipeline";
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BLOG_ID = "coolhot_";
const STORAGE_PATH = path.join(process.cwd(), "data", "naver-auth.json");
const SCREENSHOT_DIR = path.join(process.cwd(), "data", "screenshots");

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
async function wait(ms: number) { await new Promise(r => setTimeout(r, ms)); }

const REUSE_ARTICLE_ID = process.env.ARTICLE_ID ? Number(process.env.ARTICLE_ID) : null;

// ─────────────────────────────────────
// 이모지 유틸
// ─────────────────────────────────────
const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu;
function stripEmoji(text: string): string { return text.replace(emojiRegex, "").trim(); }
function startsWithEmoji(text: string): boolean { return /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(text); }

// ─────────────────────────────────────
// 마크다운 파싱
// ─────────────────────────────────────
interface Section { heading: string; body: string; }

function parseContent(content: string) {
  const lines = content.split("\n");
  const headings: string[] = [];
  const subHeadings: string[] = [];
  const boldKeywords: string[] = [];
  let intro = "";
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let inIntro = false;

  for (const line of lines) {
    const t = line.trim();

    // H1 제목 — 인트로 시작
    if (t.startsWith("# ") && !t.startsWith("## ")) { inIntro = true; continue; }

    // H2 소제목
    if (t.startsWith("## ") && !t.startsWith("### ")) {
      inIntro = false;
      if (currentSection) sections.push(currentSection);
      const raw = t.replace(/^##\s+/, "");
      headings.push(stripEmoji(raw));
      currentSection = { heading: stripEmoji(raw), body: "" };
      continue;
    }

    // 인트로 수집
    if (inIntro) {
      if (t && !t.startsWith("[IMAGE")) {
        intro += (intro ? "\n" : "") + t.replace(/\*\*(.+?)\*\*/g, "$1");
      }
      continue;
    }

    // H3 하위제목
    if (t.startsWith("### ")) {
      subHeadings.push(t.replace(/^###\s+/, ""));
    }

    // 이모지로 시작하는 짧은 줄도 하위항목
    if (!t.startsWith("#") && startsWithEmoji(t) && t.length > 3 && t.length < 50) {
      const clean = t.replace(/\*\*(.+?)\*\*/g, "$1");
      if (!subHeadings.includes(clean)) subHeadings.push(clean);
    }

    // 섹션 본문 수집
    if (currentSection) {
      if (t.startsWith("[IMAGE")) continue;
      if (t === "---") continue;
      if (t === "") { if (!currentSection.body.endsWith("\n")) currentSection.body += "\n"; continue; }
      let clean = t.replace(/^###\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^>\s*/, "");
      // 목록 기호 정규화: "* ", "- " → "• "
      clean = clean.replace(/^[\*\-]\s+/, "• ");
      // 따옴표 정규화: 스마트 따옴표 → 일반 따옴표
      clean = clean.replace(/[""]/g, '"').replace(/['']/g, "'");
      currentSection.body += (currentSection.body ? "\n" : "") + clean;
    }
  }
  if (currentSection) sections.push(currentSection);

  // 볼드 키워드
  for (const m of content.matchAll(/\*\*(.+?)\*\*/g)) {
    if (!boldKeywords.includes(m[1])) boldKeywords.push(m[1]);
  }

  return { headings, subHeadings, boldKeywords, intro, sections };
}

// ─────────────────────────────────────
// 메인
// ─────────────────────────────────────
async function main() {
  // ===== 1. 글 생성 또는 재활용 =====
  let articleId: number;
  if (REUSE_ARTICLE_ID) {
    console.log(`[1] 기존 article ${REUSE_ARTICLE_ID} 재활용`);
    articleId = REUSE_ARTICLE_ID;
  } else {
    console.log("[1] 글 생성 중...");
    const genResult = await runPipelineForBlog(1);
    if (!genResult.success || !genResult.articleId) {
      console.error("글 생성 실패:", genResult.error);
      await prisma.$disconnect();
      return;
    }
    articleId = genResult.articleId;
  }

  const article = await prisma.article.findUnique({ where: { id: articleId }, include: { keyword: true } });
  if (!article) { console.error("Article not found"); return; }

  const content = article.retouched;
  const title = article.title;
  const hashtags: string[] = JSON.parse(article.hashtags);
  const imageUrls: string[] = [];
  if (article.editorScript) {
    for (const cmd of article.editorScript as any[]) {
      if (cmd.type === "image" && cmd.path) imageUrls.push(cmd.path);
    }
  }

  const { headings, subHeadings, boldKeywords, intro, sections } = parseContent(content);

  console.log(`[1] "${title}" (${content.length}자, 이미지 ${imageUrls.length}장)`);
  console.log(`[1] 소제목 ${sections.length}개, 하위제목 ${subHeadings.length}개, 볼드 ${boldKeywords.length}개`);

  // ===== 2. 브라우저 + 로그인 =====
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--window-position=100,100", "--window-size=1280,900"],
  });
  const ctxOpts: any = { viewport: { width: 1280, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" };
  if (fs.existsSync(STORAGE_PATH)) ctxOpts.storageState = STORAGE_PATH;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  (globalThis as any).__debugPage = page;

  // 로그인 체크
  await page.goto(`https://blog.naver.com/${BLOG_ID}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  const writeBtn = await page.$('a[href*="postwrite"]');
  if (!writeBtn) {
    console.log("[2] 로그인 필요 — 수동 로그인 대기 (30초)");
    await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/blog.naver.com/**`, { timeout: 30000 }).catch(() => {});
    await ctx.storageState({ path: STORAGE_PATH });
    console.log("[2] 로그인 세션 저장");
  }

  // 에디터 이동
  await page.goto(`https://blog.naver.com/${BLOG_ID}/postwrite`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(5000);

  // 팝업 닫기
  try { const btn = await page.waitForSelector('button.se-popup-button-cancel', { timeout: 5000 }); if (btn && await btn.isVisible()) { await wait(500); await btn.click(); console.log("[2] 작성중 팝업 닫기"); } } catch {}
  await wait(500);
  try { const btn = await page.$('.se-help-panel-close-button'); if (btn && await btn.isVisible()) { await btn.click(); console.log("[2] 도움말 닫기"); } } catch {}
  await wait(500);

  // 토글 초기화
  for (const name of ['strikethrough', 'bold', 'italic', 'underline']) {
    const btn = await page.$(`button[data-name="${name}"]`);
    if (btn) { const cls = await btn.getAttribute("class") || ""; if (cls.includes("se-is-selected")) { await btn.click(); await wait(200); } }
  }

  // ─── 유틸 함수 ───

  /** 커서를 본문 마지막 p 요소의 끝으로 이동 */
  async function cursorToEnd() {
    const pos = await page.evaluate(() => {
      const ps = document.querySelectorAll('.se-content .se-component:not(.se-documentTitle) p.se-text-paragraph');
      const last = ps[ps.length - 1] as HTMLElement;
      if (!last) return null;
      last.scrollIntoView({ block: 'end' });
      const rect = last.getBoundingClientRect();
      // 중앙 x좌표 (+ 버튼 회피)
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      await wait(200);
      await page.keyboard.press("End");
      await wait(200);
    }
  }
  async function insertQuotation(style: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const dd = await page.$('.se-document-toolbar-select-option-button[data-name="quotation"]');
      if (!dd || !(await dd.isVisible())) continue;
      await dd.click(); await wait(1000);
      try {
        const sb = await page.waitForSelector(`button[class*="quotation_${style}"]`, { timeout: 3000 });
        if (sb && await sb.isVisible()) { await sb.click(); await wait(1000); return; }
      } catch { await page.keyboard.press("Escape"); await wait(500); }
    }
  }

  async function escapeQuotation() {
    const pos = await page.evaluate(() => {
      const qs = document.querySelectorAll('.se-section-quotation, .se-component-quotation');
      const last = qs[qs.length - 1] as HTMLElement;
      if (!last) return null;
      const r = last.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height + 20 };
    });
    if (pos) { await page.mouse.click(pos.x, pos.y); await wait(500); }
  }

  async function insertHr() {
    const btn = await page.$('button[data-name="horizontal-line"]');
    if (btn && await btn.isVisible()) { await btn.click(); await wait(1000); }
  }

  async function setAlign(a: "left" | "center") {
    // 1) 정렬 드롭다운 버튼 클릭
    const alignBtn = await page.$('button[data-name="align-drop-down-with-justify"]');
    if (!alignBtn || !(await alignBtn.isVisible())) return;
    await alignBtn.click();
    await wait(500);

    // 2) 정확한 클래스명으로 옵션 클릭
    const optSelector = a === "center"
      ? 'button.se-toolbar-option-align-center-button'
      : 'button.se-toolbar-option-align-left-button';
    const opt = await page.$(optSelector);
    if (opt && await opt.isVisible()) {
      await opt.click();
      await wait(300);
    } else {
      await page.keyboard.press("Escape");
    }
  }

  async function dragSelect(rect: { x: number; y: number; width: number; height: number }) {
    await page.mouse.move(rect.x + 2, rect.y + rect.height / 2, { steps: 5 });
    await wait(100); await page.mouse.down(); await wait(50);
    await page.mouse.move(rect.x + rect.width - 2, rect.y + rect.height / 2, { steps: 10 });
    await wait(100); await page.mouse.up(); await wait(300);
  }

  async function getTextRect(t: string) {
    return page.evaluate((text) => {
      const e = document.querySelector('.se-content');
      if (!e) return null;
      const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      let n: Text | null;
      while ((n = w.nextNode() as Text | null)) {
        const i = n.textContent?.indexOf(text) ?? -1;
        if (i >= 0) {
          (n.parentElement as HTMLElement)?.scrollIntoView({ block: 'center' });
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
          const b = r.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      }
      return null;
    }, t);
  }

  async function typeBody(text: string) {
    const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
    for (const line of cleaned.split("\n")) {
      if (line.trim() === "") { await page.keyboard.press("Enter"); await wait(rand(200, 400)); continue; }
      if (line.trim() === "---") continue;
      // 한 글자씩 타이핑 (600타/분)
      for (const char of line) {
        await page.keyboard.type(char, { delay: rand(70, 130) });
      }
      await wait(rand(100, 200));
      await page.keyboard.press("Enter");
      await wait(rand(150, 350));
    }
  }

  /** 이미지 업로드 + 크기 조정 + 패널 닫기 + 커서 탈출 */
  async function uploadImage(url: string) {
    let localPath = url;
    if (url.startsWith("http")) {
      try {
        const resp = await fetch(url);
        const buf = Buffer.from(await resp.arrayBuffer());
        if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        localPath = path.join(SCREENSHOT_DIR, `upload-${Date.now()}.png`);
        fs.writeFileSync(localPath, buf);
      } catch { console.warn("  이미지 다운로드 실패"); return; }
    }

    const [fc] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null),
      (async () => { const ib = await page.$('button[data-name="image"]'); if (ib && await ib.isVisible()) await ib.click(); })(),
    ]);

    if (!fc) { console.warn("  filechooser 미감지"); return; }
    await fc.setFiles(localPath);
    console.log("  업로드 완료");
    await wait(3000);

    // 크기 w400 DOM 조정
    await page.evaluate(() => {
      const imgs = document.querySelectorAll('.se-image-resource');
      const lastImg = imgs[imgs.length - 1] as HTMLImageElement;
      if (lastImg) { lastImg.style.width = "400px"; lastImg.style.height = "auto"; }
    });
    await wait(300);

    // Escape 1번으로 이미지 선택 해제 + 패널 닫기
    await page.keyboard.press("Escape");
    await wait(500);

    // 이미지 아래로 커서 이동
    await page.keyboard.press("ArrowDown");
    await wait(200);
    await page.keyboard.press("Enter");
    await wait(300);
  }

  /** 하위항목에 연두색 적용 */
  /** 하위항목 서식: fs19 + 볼드 + #00a84b 연두색 */
  async function applySubItemColor(text: string) {
    const cleanText = stripEmoji(text).trim();
    let rect = await getTextRect(text);
    if (!rect) rect = await getTextRect(cleanText);
    if (!rect) return;
    await wait(200);
    rect = await getTextRect(text) || await getTextRect(cleanText);
    if (!rect) return;

    await dragSelect(rect);

    // 1. 글자크기 19
    const fsBtn = await page.$('button[data-name="font-size"]');
    if (fsBtn && await fsBtn.isVisible()) {
      await fsBtn.click(); await wait(500);
      const fs19 = await page.$('button[class*="fs19"]');
      if (fs19 && await fs19.isVisible()) { await fs19.click(); await wait(300); }
      else await page.keyboard.press("Escape");
    }

    // 2. 볼드
    const boldBtn = await page.$('button[data-name="bold"]');
    if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); await wait(300); }

    // 3. 색상 #00a84b (연두)
    const cb = await page.$('button[data-name="font-color"]');
    if (cb && await cb.isVisible()) {
      await cb.click(); await wait(500);
      const lime = await page.$('button.se-color-palette[data-color="#00a84b"]');
      if (lime && await lime.isVisible()) { await lime.click(); console.log(`    fs19+볼드+연두 적용`); await wait(300); }
      else await page.keyboard.press("Escape");
    }
  }

  /** 볼드 적용 */
  async function applyBold(text: string) {
    let rect = await getTextRect(text);
    if (!rect) return;
    await wait(200);
    rect = await getTextRect(text);
    if (!rect) return;
    await dragSelect(rect);
    const bb = await page.$('button[data-name="bold"]');
    if (bb && await bb.isVisible()) { await bb.click(); await wait(300); }
  }

  // ───────────────────────────────────
  // [A] 제목
  // ───────────────────────────────────
  console.log("\n[A] 제목");
  await page.click('.se-documentTitle .se-text-paragraph');
  await wait(500);
  await page.keyboard.type(title, { delay: rand(80, 130) });
  await wait(500);

  // 본문 진입
  const be = await page.$('.se-content .se-component:not(.se-documentTitle) .se-text-paragraph');
  if (be && await be.isVisible()) { await be.click(); await wait(500); }

  // ───────────────────────────────────
  // [B] 스티커 (가운데)
  // ───────────────────────────────────
  console.log("[B] 스티커");
  await setAlign("center");
  const stBtn = await page.$('button[data-name="sticker"]');
  if (stBtn && await stBtn.isVisible()) {
    await stBtn.click(); await wait(2000);
    const st = await page.$('button.se-sidebar-element-sticker');
    if (st && await st.isVisible()) { await st.click(); console.log("  삽입"); await wait(2000); }
    // 스티커 패널 닫기
    const stBtn2 = await page.$('button[data-name="sticker"]');
    if (stBtn2 && await stBtn2.isVisible()) { await stBtn2.click(); await wait(500); }
  }

  // ───────────────────────────────────
  // [C] 인트로 (가운데 정렬)
  // ───────────────────────────────────
  console.log("[C] 인트로");
  // 스티커 후 새 문단은 기본 왼쪽 정렬 — 다시 가운데로
  await setAlign("center");
  for (const line of intro.split("\n")) {
    await page.keyboard.type(line, { delay: rand(70, 130) });
    await page.keyboard.press("Enter"); await wait(150);
  }
  await page.keyboard.press("Enter"); await wait(300);
  // 인트로 종료 → 왼쪽 정렬 복원
  await setAlign("left"); await wait(300);

  // ───────────────────────────────────
  // [D] 대표주제 (인용구4 + 크기24 + #007433)
  // ───────────────────────────────────
  console.log("[D] 대표주제");
  const mainTopic = headings[0] || title;
  await insertQuotation("underline");
  await page.keyboard.type(mainTopic, { delay: rand(70, 130) });
  await wait(500);

  // Home→Shift+End로 선택 → 서식 적용
  await page.keyboard.press("Home"); await page.keyboard.press("Shift+End"); await wait(300);
  const fs1 = await page.$('button[data-name="font-size"]');
  if (fs1 && await fs1.isVisible()) { await fs1.click(); await wait(500); const b = await page.$('button[class*="fs24"]'); if (b && await b.isVisible()) { await b.click(); console.log("  크기24"); await wait(300); } else await page.keyboard.press("Escape"); }
  const c1 = await page.$('button[data-name="font-color"]');
  if (c1 && await c1.isVisible()) { await c1.click(); await wait(500); const g = await page.$('button.se-color-palette[data-color="#00756a"]'); if (g && await g.isVisible()) { await g.click(); console.log("  #007433"); await wait(300); } else await page.keyboard.press("Escape"); }
  await escapeQuotation();

  // ───────────────────────────────────
  // [E] 대표주제 설명 (첫 번째 섹션 전체 본문)
  // ───────────────────────────────────
  console.log("[E] 대표주제 설명");
  await cursorToEnd();
  await setAlign("left"); // 인트로 가운데 정렬이 이어지지 않도록 왼쪽 정렬 강제
  if (sections.length > 0) {
    await typeBody(sections[0].body);
    await page.keyboard.press("Enter"); await wait(300);
  }

  // 대표주제 하위항목 연두색
  for (const sh of subHeadings) {
    const shClean = stripEmoji(sh).trim();
    if (sections[0] && (sections[0].body.includes(shClean) || sections[0].body.includes(sh))) {
      console.log(`  하위항목: "${sh.slice(0, 25)}"`);
      await applySubItemColor(sh);
    }
  }

  // ───────────────────────────────────
  // [F] 소제목 반복 (2번째 섹션부터)
  // ───────────────────────────────────
  const sectionStart = sections.length > 1 ? 1 : sections.length; // 1개뿐이면 이미 대표주제로 사용
  let imageIdx = 0;

  for (let si = sectionStart; si < sections.length; si++) {
    const sec = sections[si];
    const isLast = si === sections.length - 1;
    console.log(`[F-${si}] 소제목: "${sec.heading.slice(0, 25)}"`);

    // 이전 서식 적용 끝에서 커서가 중간에 있을 수 있으므로 문서 끝으로 이동
    await cursorToEnd();

    // 소제목 인용구2 + 크기19 + 볼드
    await insertQuotation("line");
    await page.keyboard.type(sec.heading, { delay: rand(70, 130) });
    await wait(500);
    await page.keyboard.press("Home"); await page.keyboard.press("Shift+End"); await wait(300);
    const fsBtn = await page.$('button[data-name="font-size"]');
    if (fsBtn && await fsBtn.isVisible()) { await fsBtn.click(); await wait(500); const b = await page.$('button[class*="fs19"]'); if (b && await b.isVisible()) { await b.click(); console.log("  크기19"); await wait(300); } else await page.keyboard.press("Escape"); }
    const boldBtn = await page.$('button[data-name="bold"]');
    if (boldBtn && await boldBtn.isVisible()) { await boldBtn.click(); console.log("  볼드"); await wait(300); }
    await escapeQuotation();

    // 이미지 삽입 (마커 위치 기반: MID=첫 소제목, BOTTOM=마지막 소제목)
    if (imageIdx < imageUrls.length && imageUrls[imageIdx]) {
      if ((imageIdx === 0 && si === sectionStart) || (imageIdx === 1 && isLast)) {
        console.log(`  이미지 ${imageIdx + 1} 삽입`);
        await uploadImage(imageUrls[imageIdx]);
        imageIdx++;
      }
    }

    // 본문 (커서를 끝으로 이동 후 타이핑) + 왼쪽 정렬 강제
    await cursorToEnd();
    await setAlign("left");
    await typeBody(sec.body);
    await wait(300);

    // 하위항목 연두색
    for (const sh of subHeadings) {
      const shClean = stripEmoji(sh).trim();
      if (!sec.body.includes(shClean) && !sec.body.includes(sh)) continue;
      console.log(`  하위항목: "${sh.slice(0, 25)}"`);
      await applySubItemColor(sh);
    }

    // 볼드 키워드 (섹션별 최대 5개)
    let boldCount = 0;
    for (const kw of boldKeywords) {
      if (boldCount >= 5) break;
      if (!sec.body.includes(kw)) continue;
      await applyBold(kw);
      boldCount++;
    }

    // 구분선 (마지막 제외) — 서식 적용 후 커서를 끝으로 이동
    if (!isLast) { await cursorToEnd(); await insertHr(); }
  }

  // 남은 이미지 삽입 (마지막 소제목에 BOTTOM 이미지가 안 들어간 경우)
  while (imageIdx < imageUrls.length && imageUrls[imageIdx]) {
    console.log(`  남은 이미지 ${imageIdx + 1} 삽입`);
    await uploadImage(imageUrls[imageIdx]);
    imageIdx++;
  }

  // ───────────────────────────────────
  // [검증] 에디터 본문 vs DB 원본 유사도 비교
  // ───────────────────────────────────
  console.log("\n[검증] 에디터 본문 유사도 비교");

  // 에디터에서 텍스트 추출 (플레이스홀더 제거 + 정규화)
  let editorText = await page.evaluate(() => {
    const editor = document.querySelector('.se-content');
    if (!editor) return "";
    const paragraphs = editor.querySelectorAll('.se-component:not(.se-documentTitle) p.se-text-paragraph');
    const lines: string[] = [];
    for (const p of paragraphs) {
      const text = (p.textContent || "").trim();
      if (text && text !== "출처 입력" && !text.includes("사진 설명을 입력")) lines.push(text);
    }
    return lines.join("\n");
  });
  // 에디터 텍스트도 원본과 동일하게 정규화
  editorText = editorText
    .replace(/[""]/g, '"').replace(/['']/g, "'")
    .replace(emojiRegex, "");

  // DB 원본 → 플레인텍스트 (마크다운/마커 제거 + 목록 기호 정규화)
  const originalLines = content
    .replace(/^#\s+.+$/m, "")
    .replace(/^##\s+/gm, "")
    .replace(/^###\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^\[IMAGE_(TOP|MID|BOTTOM)\]$/gm, "")
    .replace(/^---$/gm, "")
    .split("\n")
    .map(l => l.trim())
    // 목록 기호 정규화: 에디터 타이핑 시 "* " → "• "로 변환했으므로 원본도 동일하게
    .map(l => l.replace(/^[\*\-]\s+/, "• "))
    // 스마트 따옴표 정규화
    .map(l => l.replace(/[""]/g, '"').replace(/['']/g, "'"))
    // 이모지 제거 (소제목 ## 에서는 이모지가 strip됐으므로)
    .map(l => l.replace(emojiRegex, "").trim())
    .filter(l => l.length > 5);

  // 유사도 계산: 원본 줄 중 에디터에 포함된 비율
  let matchCount = 0;
  const missing: string[] = [];
  for (const line of originalLines) {
    const keyword = line.slice(0, Math.min(15, line.length));
    if (editorText.includes(keyword)) {
      matchCount++;
    } else {
      missing.push(line.slice(0, 60));
    }
  }

  const similarity = originalLines.length > 0 ? Math.round((matchCount / originalLines.length) * 100) : 0;
  console.log(`  유사도: ${similarity}% (${matchCount}/${originalLines.length}줄 일치)`);
  console.log(`  에디터: ${editorText.length}자 / 원본: ${originalLines.join("").length}자`);

  if (missing.length > 0) {
    console.log(`  빠진 내용 ${missing.length}개:`);
    for (const m of missing.slice(0, 5)) console.log(`    - "${m}"`);
  }

  const SIMILARITY_THRESHOLD = 98;
  if (similarity < SIMILARITY_THRESHOLD) {
    console.log(`\n  ❌ 유사도 ${similarity}% < ${SIMILARITY_THRESHOLD}% — 발행 중단`);
    const errShot = path.join(SCREENSHOT_DIR, `verify-fail-${Date.now()}.png`);
    await page.screenshot({ path: errShot, fullPage: true });
    console.log(`  스크린샷: ${errShot}`);
    await wait(10000);
    await ctx.close(); await browser.close(); await prisma.$disconnect();
    return;
  }
  console.log(`  ✅ 유사도 ${similarity}% ≥ ${SIMILARITY_THRESHOLD}% — 발행 진행`);

  // ───────────────────────────────────
  // [G] 발행
  // ───────────────────────────────────
  await wait(1000);
  await page.evaluate(() => { document.querySelector('.se-content')?.scrollTo(0, 0); });
  await wait(500);
  const preShot = path.join(SCREENSHOT_DIR, `full-pre-publish-${Date.now()}.png`);
  await page.screenshot({ path: preShot, fullPage: true });
  console.log(`\n발행 전 스크린샷: ${preShot}`);

  // 발행 팝업 열기
  console.log("\n[G] 발행 팝업");
  const pubBtns = await page.$$('button');
  for (const btn of pubBtns) {
    const text = (await btn.textContent() || "").trim();
    if (await btn.isVisible() && text === "발행") { await btn.click(); await wait(2000); break; }
  }

  // 카테고리
  const blogCategory = article.blogCategory || "";
  if (blogCategory) {
    console.log(`  카테고리: ${blogCategory}`);
    const categoryDiv = await page.$('[class*="option_category"]');
    if (categoryDiv && await categoryDiv.isVisible()) {
      await categoryDiv.click(); await wait(1000);
      const cateOptions = await page.$$('[class*="option_category"] li');
      for (const opt of cateOptions) {
        const text = (await opt.textContent() || "").trim();
        if (await opt.isVisible() && text.includes(blogCategory)) { await opt.click(); console.log(`  → "${text}"`); await wait(1000); break; }
      }
      // 드롭다운 닫기
      const tagClose = await page.$('input[placeholder*="태그 입력"]');
      if (tagClose && await tagClose.isVisible()) { await tagClose.click(); await wait(500); }
    }
  }

  // 태그 (최대 10개)
  console.log("  태그 입력");
  const tagInput = await page.$('input[placeholder*="태그 입력"]');
  if (tagInput && await tagInput.isVisible()) {
    for (const tag of hashtags.slice(0, 10)) {
      await tagInput.click(); await wait(200);
      await tagInput.fill(tag); await wait(200);
      await page.keyboard.press("Enter"); await wait(500);
    }
    console.log(`  → ${Math.min(hashtags.length, 10)}개`);
  }

  // 발행 확인 (✓ 발행)
  await wait(1000);
  console.log("  발행 확인 클릭");
  let published = false;
  const allBtns = await page.$$('button');
  // 1차: confirm 클래스
  for (const btn of allBtns) {
    const cls = (await btn.getAttribute("class") || "");
    const text = (await btn.textContent() || "").trim();
    if (await btn.isVisible() && text.includes("발행") && cls.includes("confirm")) {
      await btn.click(); published = true; await wait(5000); break;
    }
  }
  // 2차: SVG 아이콘
  if (!published) {
    for (const btn of allBtns) {
      const text = (await btn.textContent() || "").trim();
      if (!text.includes("발행") || !await btn.isVisible()) continue;
      const hasSvg = await btn.$('svg, [class*="check"]');
      if (hasSvg) { await btn.click(); published = true; await wait(5000); break; }
    }
  }
  // 3차: y좌표
  if (!published) {
    for (const btn of allBtns) {
      const text = (await btn.textContent() || "").trim();
      if (text !== "발행" || !await btn.isVisible()) continue;
      const box = await btn.boundingBox();
      if (box && box.y > 500) { await btn.click(); published = true; await wait(5000); break; }
    }
  }
  if (!published) console.log("  ⚠️ 발행 버튼 못 찾음");

  const currentUrl = page.url();
  console.log(`\n발행 URL: ${currentUrl}`);
  const postShot = path.join(SCREENSHOT_DIR, `full-published-${Date.now()}.png`);
  await page.screenshot({ path: postShot, fullPage: true });
  console.log(`완료 스크린샷: ${postShot}`);

  await wait(5000);
  await ctx.close();
  await browser.close();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e.message);
  console.error("STACK:", e.stack?.slice(0, 500));
  try {
    const p = (globalThis as any).__debugPage;
    if (p) { await p.screenshot({ path: path.join(SCREENSHOT_DIR, `error-${Date.now()}.png`) }); }
  } catch {}
  process.exit(1);
});
