const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenAI } = require("@google/genai");

const geminiApiKey = defineSecret("GEMINI_API_KEY");

function getClient() {
  const apiKey = geminiApiKey.value();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  return new GoogleGenAI({ apiKey });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function generateContentWithRetry(request) {
  const delays = [13000, 26000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getClient().models.generateContent(request);
    } catch (error) {
      const isRateLimited = error?.status === 429 || error?.code === 429;
      const isDailyLimit = String(error?.message).includes("PerDay");
      if (!isRateLimited || isDailyLimit || attempt >= delays.length) throw error;
      await wait(delays[attempt]);
    }
  }
}

const FRESH_TOPIC_CACHE_MS = 24 * 60 * 60 * 1000;
let freshTopicCache = null;

function parseJsonObject(text) {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(unfenced);
}

function validateFreshTopics(value) {
  const categories = new Set(["experience", "opinion", "comparison", "social", "imagination"]);
  if (!Array.isArray(value) || value.length !== 10) return null;
  const topics = value.map((topic, index) => {
    if (!topic || typeof topic !== "object") return null;
    const title = typeof topic.title === "string" ? topic.title.trim() : "";
    const context = typeof topic.context === "string" ? topic.context.trim() : "";
    const category = typeof topic.category === "string" ? topic.category : "";
    const angles = Array.isArray(topic.angles)
      ? topic.angles.filter((angle) => typeof angle === "string").map((angle) => angle.trim()).filter(Boolean)
      : [];
    const titleWordCount = title.split(/\s+/).filter(Boolean).length;
    if (!title || title.length > 40 || titleWordCount > 3 || !context || context.length > 320 || !categories.has(category) || angles.length < 4 || angles.length > 6) return null;
    return {
      id: `fresh-${new Date().toISOString().slice(0, 10)}-${index + 1}`,
      title,
      context,
      category,
      angles,
      source: "fresh",
    };
  });
  return topics.every(Boolean) ? topics : null;
}

exports.freshTopics = onRequest(
  { region: "us-central1", timeoutSeconds: 45, memory: "256MiB", secrets: [geminiApiKey] },
  async (request, response) => {
    if (request.method !== "GET") {
      response.status(405).json({ error: "Method not allowed." });
      return;
    }

    const now = Date.now();
    if (freshTopicCache && freshTopicCache.expiresAt > now) {
      response.set("Cache-Control", "public, max-age=3600");
      response.json(freshTopicCache.payload);
      return;
    }

    try {
      const result = await generateContentWithRetry({
        model: "gemini-3.5-flash-lite",
        contents: `Use current Google Search results to create exactly 10 timely English conversation topics for Japanese A2-B1 learners.

Choose friendly, broadly interesting developments from the last few days or the current season. Prefer AI/technology, science, space, animals, food, travel, culture, entertainment, sports, nature, weather/seasons, lifestyle, or interesting discoveries. Avoid war, crime, fatal accidents, tragic disasters, partisan politics, and polarizing social conflict.

Transform each recent development into simple personal conversation material. A learner must be able to participate without having read a news article.

Title rules (highest priority):
- Use one familiar, concrete English noun whenever possible, such as Wildlife, Trains, AI, Space, Dogs, Travel, Coffee, Food, Robots, Weather, Movies, Music, Sports, Phones, Shopping, Hotels, Festivals, Flowers, Beaches, Health, or Cars.
- Use two words only when one word would be unnatural or too vague. Use three words only as a rare exception. Never use four or more words.
- The title is a simple conversation label, never a news headline or a summary. Put the timely detail in context and angles instead.
- Avoid academic or technical terms, abstract noun chains, and headline-like phrases such as "Impact of", "Future of", "Influence of", "Growing", "Changing", or "Human Presence and".

Content rules:
- Do not test names, companies, dates, statistics, article details, or prior news knowledge.
- Each context must be one short, neutral, easy sentence, with no links and no claim that requires expert knowledge.
- Angles are 4 to 6 short, concrete concepts, not complete questions. Center them on the learner's own experience, preferences, memories, simple choices, or feelings.
- Make every angle usable for an easy yes/no, A-or-B, "What...?", "Have you ever...?", "Do you like...?", or "Which do you prefer...?" question.
- Keep the timely event as the starting point, but make the English and personal discussion easy for a Japanese A2-B1 learner.

Examples of the required transformation:
- "Human Presence and Wildlife" becomes title "Wildlife"; context mentions recent animal sightings near towns; angles include animals seen, animals near home, surprising animals, favorite animals, and places animals were seen.
- "Increasing Popularity of Overnight Rail Travel" becomes title "Trains"; context mentions renewed interest in night or long-distance trains; angles include night trains, train trips, sleeping on a train, train versus plane, and a remembered trip.

Return JSON only in this exact shape:
{"topics":[{"title":"short title","context":"one short sentence introducing the timely development","category":"experience|opinion|comparison|social|imagination","angles":["4 to 6 conversational angles"]}]}`,
        config: {
          systemInstruction: "You select safe, upbeat, current material and turn it into very simple personal conversation topics for A2-B1 learners. Titles are normally one familiar concrete noun and never exceed three words. Return valid JSON only.",
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 4200,
          temperature: 0.5,
        },
      });
      const parsed = parseJsonObject(result.text?.trim() ?? "");
      const topics = validateFreshTopics(parsed?.topics);
      if (!topics) throw new Error("Invalid fresh topic response.");
      const payload = { topics, generatedAt: new Date(now).toISOString() };
      freshTopicCache = { expiresAt: now + FRESH_TOPIC_CACHE_MS, payload };
      response.set("Cache-Control", "public, max-age=3600");
      response.json(payload);
    } catch (error) {
      console.error("Fresh topic request failed", error);
      response.status(503).json({ error: "Fresh topics are temporarily unavailable." });
    }
  }
);

exports.aiChat = onRequest(
  { region: "us-central1", timeoutSeconds: 60, memory: "256MiB", secrets: [geminiApiKey] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ error: "Method not allowed." });
      return;
    }

    const systemInstruction = request.body?.systemInstruction;
    const prompt = request.body?.prompt;
    if (
      typeof systemInstruction !== "string" ||
      typeof prompt !== "string" ||
      !systemInstruction.trim() ||
      !prompt.trim() ||
      systemInstruction.length > 6000 ||
      prompt.length > 16000
    ) {
      response.status(400).json({ error: "Invalid AI request." });
      return;
    }

    try {
      const isReview = systemInstruction.includes("conversation reviewer");
      const result = await generateContentWithRetry({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: {
          systemInstruction,
          maxOutputTokens: isReview ? 4096 : 1200,
          temperature: 0.7,
        },
      });
      const text = result.text?.trim();
      if (!text) throw new Error("Empty model response.");
      response.json({ text });
    } catch (error) {
      console.error("AI request failed", error);
      response.status(502).json({ error: "AIに接続できませんでした。" });
    }
  }
);
