/**
 * 인간 시뮬레이션 유틸 — 네이버 봇 탐지 회피용
 *
 * 타이핑 속도: ~200타/분 (글자당 ~300ms, 편차 ±100ms)
 * 모든 동작에 랜덤 편차 적용, 가끔 쉬는 시간 삽입
 */

import type { Page, ElementHandle } from "playwright";

/** min~max 사이 랜덤 정수 */
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 랜덤 딜레이 (ms) */
export async function humanDelay(minMs: number, maxMs: number): Promise<void> {
  await new Promise((r) => setTimeout(r, rand(minMs, maxMs)));
}

/** 가끔 긴 쉬는 시간 — 사람이 생각하거나 화면을 읽는 느낌 */
export async function maybeRest(): Promise<void> {
  const roll = Math.random();
  if (roll < 0.03) {
    // 3% 확률: 긴 멈춤 (3~6초, 문장 구상 중)
    await humanDelay(3000, 6000);
  } else if (roll < 0.10) {
    // 7% 확률: 짧은 멈춤 (1~2초, 잠깐 생각)
    await humanDelay(1000, 2000);
  }
}

/**
 * 인간처럼 한 글자씩 타이핑 — 400타/분 속도
 * 글자당 120~200ms (평균 ~150ms = 400chars/min)
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(300, 700);

  for (const char of text) {
    await page.keyboard.type(char, { delay: rand(70, 130) });

    if (char === ".") await humanDelay(300, 700);
    else if (char === "," || char === "!" || char === "?") await humanDelay(200, 500);
    else if (char === " ") await humanDelay(50, 150);

    await maybeRest();
  }
}

/**
 * 제목처럼 짧은 텍스트를 안정적으로 입력
 * keyboard.type()으로 한번에 입력 — 에디터 내부 상태를 깨뜨리지 않음
 * (DOM 직접 조작이나 한 글자씩 함수 호출은 SmartEditor와 충돌)
 */
export async function humanFill(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(500, 800);

  // keyboard.type()은 keydown→keypress→input→keyup 이벤트를 정상 발생시킴
  // delay를 주면 한 글자씩 자연스럽게 입력됨
  await page.keyboard.type(text, { delay: rand(80, 130) });
  await humanDelay(300, 600);
}

/**
 * 긴 본문 입력 — 한 글자씩 직접 타이핑 (400타/분)
 * clipboard paste는 봇 탐지에 걸리므로 사용하지 않음.
 * 글자당 120~200ms (평균 ~150ms = 400chars/min)
 */
export async function humanTypeBody(page: Page, text: string): Promise<void> {
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      await page.keyboard.press("Enter");
      await humanDelay(500, 1200);
      continue;
    }

    for (const char of line) {
      await page.keyboard.type(char, { delay: rand(70, 130) });

      if (char === ".") await humanDelay(300, 700);
      else if (char === "," || char === "!" || char === "?") await humanDelay(200, 500);
      else if (char === " ") await humanDelay(50, 150);

      await maybeRest();
    }

    if (i < lines.length - 1) {
      await humanDelay(200, 500);
      await page.keyboard.press("Enter");
      await humanDelay(300, 800);
    }
  }
}

/** 요소로 마우스를 자연스럽게 이동 후 클릭 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = await page.waitForSelector(selector, { timeout: 10000 });
  if (!el) throw new Error(`Element not found: ${selector}`);

  const box = await el.boundingBox();
  if (!box) throw new Error(`No bounding box: ${selector}`);

  // 클릭 위치에 약간의 랜덤 오프셋 (정중앙만 클릭하는 건 봇 패턴)
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  await page.mouse.move(x, y, { steps: rand(5, 15) });
  await humanDelay(80, 200);
  await page.mouse.click(x, y);
  await humanDelay(200, 500);
}

/** 스크롤 (사람처럼 부드럽게) */
export async function humanScroll(page: Page, direction: "down" | "up" = "down", amount = 300): Promise<void> {
  const delta = direction === "down" ? amount : -amount;
  const steps = rand(3, 6);
  const stepDelta = delta / steps;

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepDelta);
    await humanDelay(50, 150);
  }
  await humanDelay(300, 800);
}
