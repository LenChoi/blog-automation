import { describe, it, expect } from "vitest";
import { toEditorScript, toHtml, type EditorCommand } from "../engine/formatter";

const sampleContent = `# 장례식 화환 가격 3번 보내고 알게 된 것들

[IMAGE_TOP]

한 2년 전이었나. 갑자기 팀장님 부친상 소식을 듣고 당황했어요.

## 🌸 화환 종류부터 알아야 해요

처음에 저는 그냥 "근조 화환"이 다인 줄 알았어요.
가장 많이 보내는 건 **3단 근조 화환**이에요.

[IMAGE_MID]

> 근조화환 가격은 어느 정도일까?
> 1단 화환 5만 원 ~ 8만 원
> 3단 화환 10만 원 ~ 15만 원

제가 처음에 7만원짜리를 보냈는데요.

## 📌 마무리

[IMAGE_BOTTOM]

급하게 보내야 할 때 당황하지 마세요 :)`;

describe("toEditorScript", () => {
  it("returns an array of commands", () => {
    const commands = toEditorScript(sampleContent, ["img1.jpg", "img2.jpg", "img3.jpg"], ["근조화환", "장례식화환"]);
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });

  it("includes heading commands for ## lines", () => {
    const commands = toEditorScript(sampleContent, ["a.jpg", "b.jpg", "c.jpg"], []);
    const headings = commands.filter((c: EditorCommand) => c.type === "heading");
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it("includes image commands", () => {
    const commands = toEditorScript(sampleContent, ["a.jpg", "b.jpg", "c.jpg"], []);
    const images = commands.filter((c: EditorCommand) => c.type === "image");
    expect(images).toHaveLength(3);
  });

  it("includes hashtags command", () => {
    const commands = toEditorScript(sampleContent, ["a.jpg", "b.jpg", "c.jpg"], ["태그1"]);
    const hashtags = commands.filter((c: EditorCommand) => c.type === "hashtags");
    expect(hashtags).toHaveLength(1);
  });
});

describe("toHtml", () => {
  it("returns HTML string", () => {
    const html = toHtml(sampleContent, ["img1.jpg", "img2.jpg", "img3.jpg"], ["태그1"]);
    expect(html).toContain("<h3");
    expect(html).toContain("color:#2DB400");
    expect(html).toContain("<img");
    expect(html).toContain("#태그1");
  });

  it("converts bold text", () => {
    const html = toHtml(sampleContent, ["a.jpg", "b.jpg", "c.jpg"], []);
    expect(html).toContain("<b>");
  });

  it("converts blockquotes", () => {
    const html = toHtml(sampleContent, ["a.jpg", "b.jpg", "c.jpg"], []);
    expect(html).toContain("border:1px solid #ddd");
  });
});
