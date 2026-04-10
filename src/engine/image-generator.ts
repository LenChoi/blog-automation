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

function extractContextAroundMarker(content: string, marker: string, position: "top" | "mid" | "bottom"): string {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const markerIndex = lines.findIndex((l) => l.trim() === marker);

  if (markerIndex !== -1) {
    // Marker found — grab surrounding lines
    const start = Math.max(0, markerIndex - 3);
    const end = Math.min(lines.length, markerIndex + 4);
    return lines
      .slice(start, end)
      .filter((l) => !l.includes("[IMAGE_"))
      .join(" ")
      .replace(/[#*>\[\]]/g, "")
      .trim();
  }

  // Marker not found — fallback: extract from position in text
  const textLines = lines.filter((l) => !l.startsWith("#") && !l.includes("[IMAGE_"));
  const total = textLines.length;
  if (total === 0) return "";

  let start: number, end: number;
  if (position === "top") {
    start = 0;
    end = Math.min(5, total);
  } else if (position === "mid") {
    start = Math.floor(total * 0.4);
    end = Math.min(start + 5, total);
  } else {
    start = Math.max(0, total - 5);
    end = total;
  }

  return textLines
    .slice(start, end)
    .join(" ")
    .replace(/[#*>\[\]]/g, "")
    .trim();
}

function buildImagePrompt(context: string, position: "top" | "mid" | "bottom"): string {
  const positionGuide = {
    top: "블로그 글 도입부에 어울리는 따뜻한 분위기의",
    mid: "본문 핵심 내용을 보완하는",
    bottom: "글 마무리에 어울리는 감성적인",
  };

  return `${positionGuide[position]} 꽃 관련 블로그 사진을 생성해주세요.

문맥: ${context}

조건:
- 실제 사진처럼 자연스러운 스타일 (일러스트나 만화 X)
- 밝고 깨끗한 톤
- 한국 블로그에 어울리는 감성
- 텍스트나 워터마크 없음
- 가로형 구도`;
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
  const markers = ["[IMAGE_TOP]", "[IMAGE_MID]", "[IMAGE_BOTTOM]"] as const;
  const positions = ["top", "mid", "bottom"] as const;
  const imageUrls: string[] = [];

  for (let i = 0; i < markers.length; i++) {
    const context = extractContextAroundMarker(content, markers[i], positions[i]);
    if (!context) {
      console.warn(`[ImageGen] No context found for ${markers[i]}`);
      imageUrls.push("");
      continue;
    }

    const prompt = buildImagePrompt(context, positions[i]);

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
