import "server-only";

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;

export type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OllamaChatParams = {
  messages: OllamaMessage[];
  model?: string;
  format?: unknown;
  temperature?: number;
  timeoutMs?: number;
};

export type OllamaChatResult = {
  content: string;
  raw: Record<string, unknown>;
  metrics?: {
    totalDuration?: number;
    loadDuration?: number;
    promptEvalCount?: number;
    promptEvalDuration?: number;
    evalCount?: number;
    evalDuration?: number;
  };
};

function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return /fetch failed|network|econnrefused|enotfound|eai_again/i.test(error.message);
}

function toStringBody(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getOllamaNotReachableMessage(
  baseUrl = getOllamaBaseUrl(),
  model = getOllamaModel(),
): string {
  return `Ollama not reachable at ${baseUrl}. Start Ollama and ensure model ${model} is installed.`;
}

export async function ollamaChat(params: OllamaChatParams): Promise<OllamaChatResult> {
  const baseUrl = getOllamaBaseUrl();
  const model = params.model?.trim() || getOllamaModel();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestBody: Record<string, unknown> = {
        model,
        messages: params.messages,
        stream: false,
      };

      if (params.format !== undefined) {
        requestBody.format = params.format;
      }

      if (typeof params.temperature === "number") {
        requestBody.options = { temperature: params.temperature };
      }

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const extra = errorBody ? ` ${errorBody.slice(0, 400)}` : "";
        throw new Error(`Ollama /api/chat failed with status ${response.status}.${extra}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const message = raw.message as { content?: unknown } | undefined;
      const content = typeof message?.content === "string" ? message.content.trim() : "";

      if (!content) {
        throw new Error("Ollama response did not include message.content.");
      }

      return {
        content,
        raw,
        metrics: {
          totalDuration:
            typeof raw.total_duration === "number" ? raw.total_duration : undefined,
          loadDuration:
            typeof raw.load_duration === "number" ? raw.load_duration : undefined,
          promptEvalCount:
            typeof raw.prompt_eval_count === "number" ? raw.prompt_eval_count : undefined,
          promptEvalDuration:
            typeof raw.prompt_eval_duration === "number"
              ? raw.prompt_eval_duration
              : undefined,
          evalCount: typeof raw.eval_count === "number" ? raw.eval_count : undefined,
          evalDuration:
            typeof raw.eval_duration === "number" ? raw.eval_duration : undefined,
        },
      };
    } catch (error) {
      lastError = error;

      if (attempt < MAX_ATTEMPTS && isRetryableNetworkError(error)) {
        continue;
      }

      if (isRetryableNetworkError(error)) {
        const details = error instanceof Error ? error.message : toStringBody(error);
        throw new Error(`${getOllamaNotReachableMessage(baseUrl, model)} (${details})`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const details =
    lastError instanceof Error ? lastError.message : toStringBody(lastError);
  throw new Error(`${getOllamaNotReachableMessage(baseUrl, model)} (${details})`);
}
