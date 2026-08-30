import type { MarketResearch, ResearchBias, ResearchRisk } from "./types";

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_RESEARCH_MODEL = "gemini-3.7-flash";

interface ResearchPayload {
  bias: ResearchBias;
  riskLevel: ResearchRisk;
  sentiment: number;
  confidence: number;
  summary: string;
  catalysts: string[];
  sourceUrls: string[];
}

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    bias: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    riskLevel: { type: "string", enum: ["low", "medium", "high", "extreme"] },
    sentiment: { type: "number", minimum: -1, maximum: 1 },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    catalysts: { type: "array", items: { type: "string" } },
    sourceUrls: { type: "array", items: { type: "string" } },
  },
  required: ["bias", "riskLevel", "sentiment", "confidence", "summary", "catalysts", "sourceUrls"],
} as const;

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .filter((part): part is { text: string } => Boolean(
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string",
      ))
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

function extractGroundingSources(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const grounding = (candidate as { groundingMetadata?: unknown }).groundingMetadata;
    if (!grounding || typeof grounding !== "object") continue;
    const chunks = (grounding as { groundingChunks?: unknown }).groundingChunks;
    if (!Array.isArray(chunks)) continue;
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== "object") continue;
      const web = (chunk as { web?: unknown }).web;
      if (web && typeof web === "object" && typeof (web as { uri?: unknown }).uri === "string") {
        urls.push((web as { uri: string }).uri);
      }
    }
  }
  return urls;
}

function validEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function uniqueStrings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, maxItems);
}

function validHttpsUrls(value: unknown): string[] {
  return uniqueStrings(value, 16, 1_000).filter((url) => {
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function parseResearch(text: string, groundingSources: string[]): ResearchPayload {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized) as Partial<ResearchPayload>;
  if (!validEnum(parsed.bias, ["bullish", "bearish", "neutral"] as const)) {
    throw new Error("Research response has an invalid bias");
  }
  if (!validEnum(parsed.riskLevel, ["low", "medium", "high", "extreme"] as const)) {
    throw new Error("Research response has an invalid risk level");
  }
  const sentiment = Number(parsed.sentiment);
  const confidence = Number(parsed.confidence);
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1_500) : "";
  const catalysts = uniqueStrings(parsed.catalysts, 8, 300);
  const sourceUrls = validHttpsUrls([
    ...validHttpsUrls(parsed.sourceUrls),
    ...validHttpsUrls(groundingSources),
  ]);
  if (!Number.isFinite(sentiment) || sentiment < -1 || sentiment > 1) {
    throw new Error("Research response has an invalid sentiment score");
  }
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error("Research response has an invalid confidence score");
  }
  if (!summary || sourceUrls.length === 0) {
    throw new Error("Research response is missing a summary or HTTPS sources");
  }
  return { bias: parsed.bias, riskLevel: parsed.riskLevel, sentiment, confidence, summary, catalysts, sourceUrls };
}

function researchModel(value?: string): string {
  const model = value?.trim() || DEFAULT_RESEARCH_MODEL;
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(model)) {
    throw new Error("Gemini model name is invalid");
  }
  return model;
}

export async function researchMarket(input: {
  apiKey: string;
  model?: string;
  symbol: string;
  marketSnapshot: Record<string, unknown>;
}): Promise<MarketResearch> {
  const model = researchModel(input.model);
  const response = await fetch(`${GEMINI_API_ROOT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "x-goog-api-key": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "You are a cautious crypto market-risk researcher. Use Google Search before answering. Never choose position size, leverage, or promise a profitable trade. Separate confirmed facts from uncertainty. Treat conflicting, weak, stale, or unverified reports as elevated risk. Return only the requested JSON.",
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: `Research material market-moving developments published or updated during the last 24 hours for ${input.symbol}. Cover macro news, regulation, exchange or custody incidents, security exploits, ETF or fund flows, liquidity shocks, and major official announcements. Prefer primary sources and established financial reporting. Use this technical snapshot only as context, never as news: ${JSON.stringify(input.marketSnapshot)}. Classify directional bias and risk conservatively. Include direct HTTPS source URLs. If evidence conflicts or is insufficient, use neutral bias, high risk, and low confidence.`,
        }],
      }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1_200,
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema: RESEARCH_SCHEMA,
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error((payload.error?.message || `Gemini research failed (${response.status})`).slice(0, 300));
  }
  const parsed = parseResearch(extractOutputText(payload), extractGroundingSources(payload));
  return {
    symbol: input.symbol,
    bias: parsed.bias,
    riskLevel: parsed.riskLevel,
    sentiment: parsed.sentiment,
    confidence: parsed.confidence,
    summary: parsed.summary,
    catalysts: parsed.catalysts,
    sources: parsed.sourceUrls,
    model,
    createdAt: Math.floor(Date.now() / 1_000),
  };
}
