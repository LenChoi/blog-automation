const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.5-flash";

export async function callGemini(prompt: string, maxTokens = 4096): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const requestBody = {
    contents: [
      { parts: [{ text: prompt }] },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  const response = await fetch(
    `${GEMINI_BASE_URL}/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || "";
}
