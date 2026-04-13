import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";

// R2 config (same as the-wreath)
const R2_ACCOUNT_ID = "7e886f461b54b421dfc5d9174a83c206";
const R2_ACCESS_KEY_ID = "e589516a4daf7db89fc38c4a9c8e9dcd";
const R2_SECRET_ACCESS_KEY = "07016f0841b1ced627b97d0e237857f9d6a7d1a38698c09c099276ed7f2ae13b";
const R2_BUCKET_NAME = "the-wreath-image";
const R2_PUBLIC_DOMAIN = "https://pub-63d7c2589b7d4e77942e15d585e3236f.r2.dev";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

/** 이미지 마커가 속한 소제목 + 본문 내용을 추출 */
function extractSectionContext(content: string, marker: string): { heading: string; body: string } {
  const lines = content.split("\n");
  const markerLineIdx = lines.findIndex((l) => l.trim() === marker);

  // 마커가 속한 섹션의 소제목(##) 찾기 — 마커 위쪽으로 올라가면서 ## 찾기
  let heading = "";
  let sectionStart = 0;
  if (markerLineIdx !== -1) {
    for (let i = markerLineIdx - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("## ")) {
        heading = trimmed.replace(/^##\s+/, "").replace(/[#*>\[\]]/g, "").trim();
        sectionStart = i + 1;
        break;
      }
    }
  }

  // 소제목부터 마커까지의 본문 추출
  const bodyLines: string[] = [];
  const endIdx = markerLineIdx !== -1 ? markerLineIdx : lines.length;
  for (let i = sectionStart; i < endIdx; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("[IMAGE_") || trimmed === "---") continue;
    bodyLines.push(trimmed.replace(/[#*>\[\]]/g, "").trim());
  }

  // fallback — 소제목 못 찾으면 마커 주변 5줄
  if (!heading && markerLineIdx !== -1) {
    const start = Math.max(0, markerLineIdx - 5);
    const end = Math.min(lines.length, markerLineIdx);
    for (let i = start; i < end; i++) {
      const t = lines[i].trim();
      if (t && !t.startsWith("[IMAGE_")) bodyLines.push(t.replace(/[#*>\[\]]/g, ""));
    }
  }

  return {
    heading: heading || "꽃과 식물",
    body: bodyLines.slice(0, 5).join(" ").slice(0, 300),
  };
}

function buildImagePrompt(heading: string, body: string): string {
  return `네이버 블로그에 사용할 사진을 생성해주세요.

이 사진은 아래 소주제에 대한 블로그 글에 삽입될 이미지입니다.

소주제: ${heading}
내용 요약: ${body}

조건:
- 소주제 및 내용과 직접적으로 관련 있는 이미지를 생성하세요
- 실제 사진처럼 자연스러운 스타일 (일러스트나 만화 X)
- 밝고 깨끗한 톤, 한국 블로그에 어울리는 감성
- 텍스트, 워터마크, 글자 없음
- 가로형 구도 (16:9 비율)
- 꽃, 화환, 식물 등 관련 소재를 실제 상황에 맞게 촬영한 듯한 느낌`;
}

async function generateSingleImage(prompt: string): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const requestBody = {
    contents: [
      { parts: [{ text: prompt }] },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    console.warn(`[ImageGen] Gemini error: ${response.status}`);
    return null;
  }

  const data = await response.json();
  const candidates = data?.candidates;
  if (!candidates?.[0]?.content?.parts) return null;

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  return null;
}

function toSlug(keyword: string): string {
  // 한글 키워드를 URL-safe 파일명으로 변환
  return keyword
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^가-힣a-zA-Z0-9\-]/g, "")
    .slice(0, 50);
}

async function uploadToR2(
  imageBuffer: Buffer,
  mimeType: string,
  keyword: string,
  position: string,
): Promise<string> {
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  const now = new Date();
  const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
  const slug = toSlug(keyword);
  const timestamp = now.getTime();
  // SEO-friendly filename: 키워드-위치-타임스탬프.확장자
  const objectKey = `blog/${datePath}/${slug}-${position}-${timestamp}.${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      Body: imageBuffer,
      ContentType: mimeType,
    })
  );

  return `${R2_PUBLIC_DOMAIN}/${objectKey}`;
}

export async function generateImagesForArticle(content: string, keyword: string = ""): Promise<string[]> {
  // IMAGE_TOP은 사용하지 않음 — 소제목 마지막에만 이미지 배치
  const markers = ["[IMAGE_MID]", "[IMAGE_BOTTOM]"] as const;
  const positions = ["mid", "bottom"] as const;
  const imageUrls: string[] = [];

  for (let i = 0; i < markers.length; i++) {
    const { heading, body } = extractSectionContext(content, markers[i]);
    if (!heading && !body) {
      console.warn(`[ImageGen] No context found for ${markers[i]}`);
      imageUrls.push("");
      continue;
    }
    console.log(`[ImageGen] ${markers[i]} → 소주제: "${heading}", 내용: "${body.slice(0, 80)}..."`);

    const prompt = buildImagePrompt(heading, body);

    try {
      const imageBuffer = await generateSingleImage(prompt);
      if (!imageBuffer) {
        console.warn(`[ImageGen] Failed to generate image for ${markers[i]}`);
        imageUrls.push("");
        continue;
      }

      const url = await uploadToR2(imageBuffer, "image/png", keyword, positions[i]);
      console.log(`[ImageGen] Generated ${markers[i]}: ${url}`);
      imageUrls.push(url);
    } catch (error) {
      console.warn(`[ImageGen] Error for ${markers[i]}:`, error);
      imageUrls.push("");
    }
  }

  return imageUrls;
}
