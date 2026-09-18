import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { GoogleGenAI } from "../functions/node_modules/@google/genai/dist/node/index.mjs";

function parseArgs(argv) {
  const samples = [];
  for (const value of argv) {
    const separator = value.indexOf(":");
    if (separator < 1) throw new Error(`Use expected-language:path, received: ${value}`);
    const expected = value.slice(0, separator);
    if (!new Set(["ja", "en"]).has(expected)) throw new Error(`Expected language must be ja or en: ${value}`);
    samples.push({ expected, path: resolve(value.slice(separator + 1)) });
  }
  if (!samples.length) throw new Error("Provide at least one expected-language:path sample.");
  return samples;
}

function mimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".webm") return "audio/webm";
  throw new Error(`Unsupported audio extension: ${extension}`);
}

function loadLocalApiKey(text) {
  const line = text.split(/\r?\n/).find((candidate) => /^\s*GEMINI_API_KEY\s*=/.test(candidate));
  return line?.replace(/^\s*GEMINI_API_KEY\s*=\s*/, "").trim().replace(/^['"]|['"]$/g, "");
}

function parseResult(text) {
  const value = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
  if (!["ja", "en", "unknown"].includes(value.language) || typeof value.transcript !== "string") {
    throw new Error("Gemini returned an invalid language result.");
  }
  return { language: value.language, transcript: value.transcript.trim() };
}

const samples = parseArgs(process.argv.slice(2));
const envText = await readFile(new URL("../functions/.env.local", import.meta.url), "utf8");
const apiKey = loadLocalApiKey(envText);
if (!apiKey) throw new Error("GEMINI_API_KEY is not configured in functions/.env.local.");
const client = new GoogleGenAI({ apiKey });

const results = [];
for (const sample of samples) {
  const audio = await readFile(sample.path);
  const startedAt = performance.now();
  const response = await client.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mimeType(sample.path), data: audio.toString("base64") } },
        { text: "Identify whether this single utterance is Japanese or English and transcribe exactly what is spoken. Return JSON only: {\"language\":\"ja\"|\"en\"|\"unknown\",\"transcript\":\"...\"}. Use unknown only when speech is not intelligible or is neither language." },
      ],
    }],
    config: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 300,
    },
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const parsed = parseResult(response.text ?? "");
  results.push({
    file: basename(sample.path),
    expected: sample.expected,
    ...parsed,
    correct: parsed.language === sample.expected,
    elapsedMs,
  });
}

const averageMs = Math.round(results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length);
process.stdout.write(`${JSON.stringify({ model: "gemini-3.5-flash-lite", results, averageMs }, null, 2)}\n`);
