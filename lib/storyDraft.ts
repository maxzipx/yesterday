import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAiFlags } from "@/lib/ai-flags";
import { ollamaChat } from "@/lib/ollama";
import { getRepresentativeArticles } from "@/lib/representative";
import type { Database } from "@/lib/supabase/types";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "why_it_matters", "confidence", "flags"],
  properties: {
    headline: { type: "string", minLength: 5, maxLength: 180 },
    summary: { type: "string", minLength: 20, maxLength: 900 },
    why_it_matters: { type: "string", minLength: 10, maxLength: 220 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    flags: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 40 },
      maxItems: 10,
    },
  },
} as const;

const BASE_SYSTEM_PROMPT = [
  "You are a neutral news editor writing concise daily brief entries.",
  "Use only the provided fact pack lines.",
  "Do not invent numbers, quotes, dates, or facts not present in the input.",
  "If reports are inconsistent or unclear, explicitly say reports vary and add an appropriate flag.",
  "Return JSON fields matching the schema.",
  "summary must be 2-4 sentences and at most 120 words.",
  "why_it_matters must be exactly 1 sentence and at most 30 words.",
  "confidence must be between 0 and 1.",
].join(" ");

export type GeneratedStoryDraft = {
  headline: string;
  summary: string;
  why_it_matters: string;
  confidence: number;
  flags: string[];
};

type DraftPayload = {
  headline: unknown;
  summary: unknown;
  why_it_matters: unknown;
  confidence: unknown;
  flags: unknown;
};

function sentenceCount(value: string): number {
  return value
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function wordCount(value: string): number {
  return value
    .trim()
    .split(/\s+/g)
    .filter((word) => word.length > 0).length;
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("Model response did not contain valid JSON.");
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      throw new Error("Model response contained malformed JSON.");
    }
  }
}

function validateDraftPayload(payload: DraftPayload): GeneratedStoryDraft {
  const headline =
    typeof payload.headline === "string" ? payload.headline.trim() : "";
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const whyItMatters =
    typeof payload.why_it_matters === "string" ? payload.why_it_matters.trim() : "";
  const confidence =
    typeof payload.confidence === "number"
      ? Math.max(0, Math.min(1, payload.confidence))
      : Number.NaN;
  const rawFlags = Array.isArray(payload.flags)
    ? payload.flags
        .filter((flag): flag is string => typeof flag === "string")
        .map((flag) => flag.trim())
        .filter((flag) => flag.length > 0)
    : [];
  const flags = normalizeAiFlags(rawFlags);

  const validationErrors: string[] = [];

  if (!headline) {
    validationErrors.push("headline is required.");
  }

  if (!summary) {
    validationErrors.push("summary is required.");
  }

  if (!whyItMatters) {
    validationErrors.push("why_it_matters is required.");
  }

  if (!Number.isFinite(confidence)) {
    validationErrors.push("confidence must be a number.");
  }

  if (sentenceCount(summary) < 2 || sentenceCount(summary) > 4) {
    validationErrors.push("summary must contain 2-4 sentences.");
  }

  if (wordCount(summary) > 120) {
    validationErrors.push("summary must be <= 120 words.");
  }

  if (sentenceCount(whyItMatters) !== 1) {
    validationErrors.push("why_it_matters must contain exactly 1 sentence.");
  }

  if (wordCount(whyItMatters) > 30) {
    validationErrors.push("why_it_matters must be <= 30 words.");
  }

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "));
  }

  return {
    headline,
    summary,
    why_it_matters: whyItMatters,
    confidence,
    flags,
  };
}

function buildFactPack(
  items: Awaited<ReturnType<typeof getRepresentativeArticles>>,
): string {
  return items
    .map((item, index) => {
      const snippet = item.snippet?.trim() ? ` | Snippet: ${item.snippet.trim()}` : "";
      return `[${index + 1}] Publisher: ${item.publisher} | Title: ${item.title}${snippet}`;
    })
    .join("\n");
}

async function generateAttempt(
  clusterId: string,
  factPack: string,
  strictJsonOnly: boolean,
): Promise<GeneratedStoryDraft> {
  const strictInstruction = strictJsonOnly
    ? "Return ONLY valid JSON. No markdown. No extra text."
    : "Return JSON matching the schema.";

  const userPrompt = [
    "Write a draft story block from the fact pack.",
    "Tone: neutral and factual.",
    "Rules:",
    "- summary: 2-4 sentences, <=120 words.",
    "- why_it_matters: 1 sentence, <=30 words.",
    "- include reports vary when sources conflict/unclear and add a relevant flag.",
    "- confidence lower when details are uncertain or source count is limited.",
    strictInstruction,
    "",
    "Fact pack:",
    factPack,
  ].join("\n");

  const response = await ollamaChat({
    messages: [
      { role: "system", content: BASE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    format: OUTPUT_SCHEMA,
    temperature: 0.2,
    timeoutMs: 180_000,
  });

  console.info("[story-draft] ollama response", {
    clusterId,
    strictJsonOnly,
    metrics: response.metrics,
  });

  const parsed = parseJsonObject(response.content) as DraftPayload;
  return validateDraftPayload(parsed);
}

export async function generateStoryDraftFromCluster(
  clusterId: string,
  supabase?: SupabaseClient<Database>,
): Promise<GeneratedStoryDraft> {
  const representatives = await getRepresentativeArticles(clusterId, 6, supabase);
  if (representatives.length < 3) {
    throw new Error(
      "Not enough representative articles to draft this story (need at least 3).",
    );
  }

  const factPack = buildFactPack(representatives);

  try {
    return await generateAttempt(clusterId, factPack, false);
  } catch (firstError) {
    try {
      return await generateAttempt(clusterId, factPack, true);
    } catch (secondError) {
      const firstMessage =
        firstError instanceof Error ? firstError.message : String(firstError);
      const secondMessage =
        secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(
        `Failed to generate a valid story draft JSON. First attempt: ${firstMessage} Second attempt: ${secondMessage}`,
      );
    }
  }
}
