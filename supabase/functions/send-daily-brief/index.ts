import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

type DailyBrief = {
  id: string;
  brief_date: string;
  title: string | null;
};

type PushPrefRow = {
  user_id: string;
  expo_push_token: string | null;
  notifications_enabled: boolean;
  notify_time_local: string;
  timezone: string;
  last_sent_for_date: string | null;
};

type DueRecipient = {
  userId: string;
  token: string;
  timezone: string;
  localDate: string;
  localTime: string;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: {
    briefDate: string;
    briefId: string;
  };
};

type ExpoResponseItem = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type AttemptLogInsert = {
  run_id: string;
  user_id: string;
  expo_push_token: string;
  local_date: string;
  local_time: string;
  timezone: string;
  status: "sent" | "failed";
  error_code: string | null;
  error_message: string | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_EXPO_BATCH_SIZE = 100;
const MAX_EXPO_SEND_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 750;
const DELIVERY_WINDOW_MINUTES = 5;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function readCronSecret(request: Request): string | null {
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret) {
    return headerSecret;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function toLocalParts(now: Date, timeZone: string): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function isDryRun(url: URL): boolean {
  const value = url.searchParams.get("dryRun")?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMinutes(timeValue: string): number | null {
  const trimmed = String(timeValue).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const [hours, minutes] = trimmed.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}

function isDueWithinWindow(localTime: string, targetTime: string): boolean {
  const nowMinutes = toMinutes(localTime);
  const targetMinutes = toMinutes(targetTime);
  if (nowMinutes === null || targetMinutes === null) {
    return false;
  }

  if (nowMinutes < targetMinutes) {
    return false;
  }

  return (nowMinutes - targetMinutes) < DELIVERY_WINDOW_MINUTES;
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [values];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function sendExpoBatchWithRetry(messages: ExpoMessage[]): Promise<ExpoResponseItem[]> {
  let lastError = "Unknown Expo send failure.";

  for (let attempt = 1; attempt <= MAX_EXPO_SEND_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const text = await response.text();
        lastError = `Expo push API failed (${response.status}): ${text}`;

        if (response.status >= 500 || response.status === 429) {
          if (attempt < MAX_EXPO_SEND_ATTEMPTS) {
            await sleep(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
        }

        throw new Error(lastError);
      }

      const payload = (await response.json()) as { data?: ExpoResponseItem[] };
      const items = payload.data ?? [];
      if (items.length !== messages.length) {
        const expanded: ExpoResponseItem[] = [];
        for (let index = 0; index < messages.length; index += 1) {
          expanded.push(items[index] ?? {
            status: "error",
            message: "Missing result item from Expo response.",
            details: { error: "MissingResultItem" },
          });
        }
        return expanded;
      }

      return items;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_EXPO_SEND_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
    }
  }

  throw new Error(lastError);
}

async function createRunLog(
  supabase: ReturnType<typeof createClient>,
  input: {
    dryRun: boolean;
    briefId: string | null;
    briefDate: string | null;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("push_delivery_runs")
      .insert({
        dry_run: input.dryRun,
        brief_id: input.briefId,
        brief_date: input.briefDate,
        status: "running",
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.warn("[send-daily-brief] run log insert skipped", error?.message);
      return null;
    }

    return data.id as string;
  } catch (error) {
    console.warn("[send-daily-brief] run log insert failed", error);
    return null;
  }
}

async function finalizeRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  input: {
    status: "ok" | "error";
    recipientsMatched: number;
    sentCount: number;
    failedCount: number;
    invalidTokensRemoved: number;
    durationMs: number;
    errorText?: string | null;
  },
) {
  if (!runId) {
    return;
  }

  try {
    await supabase
      .from("push_delivery_runs")
      .update({
        status: input.status,
        recipients_matched: input.recipientsMatched,
        sent_count: input.sentCount,
        failed_count: input.failedCount,
        invalid_tokens_removed: input.invalidTokensRemoved,
        duration_ms: input.durationMs,
        error_text: input.errorText ?? null,
      })
      .eq("id", runId);
  } catch (error) {
    console.warn("[send-daily-brief] run log finalize failed", error);
  }
}

async function insertAttemptLogs(
  supabase: ReturnType<typeof createClient>,
  rows: AttemptLogInsert[],
) {
  if (rows.length === 0) {
    return;
  }

  const chunks = chunkArray(rows, 500);
  for (const chunk of chunks) {
    try {
      const { error } = await supabase
        .from("push_delivery_attempts")
        .insert(chunk);

      if (error) {
        console.warn("[send-daily-brief] attempt log insert skipped", error.message);
        return;
      }
    } catch (error) {
      console.warn("[send-daily-brief] attempt log insert failed", error);
      return;
    }
  }
}

Deno.serve(async (request) => {
  const startedAt = Date.now();

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "Method not allowed. Use GET or POST." });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET")?.trim();
  if (!expectedSecret) {
    return json(500, { error: "CRON_SECRET is not configured in function secrets." });
  }

  const providedSecret = readCronSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return json(401, { error: "Unauthorized." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function secrets.",
    });
  }

  const dryRun = isDryRun(new URL(request.url));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let runId: string | null = null;
  let recipientsMatched = 0;
  let sent = 0;
  let failed = 0;
  let invalidTokensRemoved = 0;

  try {
    const { data: briefData, error: briefError } = await supabase
      .from("daily_briefs")
      .select("id, brief_date, title")
      .eq("status", "published")
      .order("brief_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (briefError) {
      throw new Error(`Failed loading published brief: ${briefError.message}`);
    }

    const brief = (briefData ?? null) as DailyBrief | null;
    runId = await createRunLog(supabase, {
      dryRun,
      briefId: brief?.id ?? null,
      briefDate: brief?.brief_date ?? null,
    });

    if (!brief) {
      await finalizeRunLog(supabase, runId, {
        status: "ok",
        recipientsMatched: 0,
        sentCount: 0,
        failedCount: 0,
        invalidTokensRemoved: 0,
        durationMs: Date.now() - startedAt,
      });

      return json(200, {
        ok: true,
        dryRun,
        message: "No published brief available. No notifications sent.",
        recipientsMatched: 0,
        sent: 0,
        failed: 0,
        invalidTokensRemoved: 0,
      });
    }

    const { data: prefData, error: prefError } = await supabase
      .from("user_push_prefs")
      .select(
        "user_id, expo_push_token, notifications_enabled, notify_time_local, timezone, last_sent_for_date",
      )
      .eq("notifications_enabled", true)
      .not("expo_push_token", "is", null);

    if (prefError) {
      throw new Error(`Failed loading push prefs: ${prefError.message}`);
    }

    const now = new Date();
    const dueRecipients: DueRecipient[] = [];
    for (const row of (prefData ?? []) as PushPrefRow[]) {
      if (!row.expo_push_token || !row.notifications_enabled) {
        continue;
      }

      const timeZone = row.timezone?.trim() || "UTC";

      let local: { date: string; time: string };
      try {
        local = toLocalParts(now, timeZone);
      } catch {
        local = toLocalParts(now, "UTC");
      }

      const targetTime = String(row.notify_time_local).slice(0, 5);
      if (!isDueWithinWindow(local.time, targetTime)) {
        continue;
      }

      if (row.last_sent_for_date === local.date) {
        continue;
      }

      dueRecipients.push({
        userId: row.user_id,
        token: row.expo_push_token,
        timezone: timeZone,
        localDate: local.date,
        localTime: local.time,
      });
    }

    recipientsMatched = dueRecipients.length;
    if (dueRecipients.length === 0) {
      await finalizeRunLog(supabase, runId, {
        status: "ok",
        recipientsMatched: 0,
        sentCount: 0,
        failedCount: 0,
        invalidTokensRemoved: 0,
        durationMs: Date.now() - startedAt,
      });

      return json(200, {
        ok: true,
        dryRun,
        briefDate: brief.brief_date,
        recipientsMatched: 0,
        sent: 0,
        failed: 0,
        invalidTokensRemoved: 0,
        message: "No recipients due in the current delivery window.",
      });
    }

    const messageTitle = "Yesterday Brief";
    const messageBody = brief.title
      ? `${brief.title} is ready.`
      : `Your brief for ${brief.brief_date} is ready.`;

    if (dryRun) {
      await finalizeRunLog(supabase, runId, {
        status: "ok",
        recipientsMatched,
        sentCount: 0,
        failedCount: 0,
        invalidTokensRemoved: 0,
        durationMs: Date.now() - startedAt,
      });

      return json(200, {
        ok: true,
        dryRun: true,
        briefDate: brief.brief_date,
        recipientsMatched,
        sampleRecipient: dueRecipients[0],
        messageTitle,
        messageBody,
      });
    }

    const messages = dueRecipients.map((recipient) => ({
      to: recipient.token,
      title: messageTitle,
      body: messageBody,
      sound: "default" as const,
      data: {
        briefDate: brief.brief_date,
        briefId: brief.id,
      },
    }));

    const messageChunks = chunkArray(messages, MAX_EXPO_BATCH_SIZE);
    const recipientChunks = chunkArray(dueRecipients, MAX_EXPO_BATCH_SIZE);
    const attemptLogs: AttemptLogInsert[] = [];
    const successRecipients: DueRecipient[] = [];

    for (let chunkIndex = 0; chunkIndex < messageChunks.length; chunkIndex += 1) {
      const messageChunk = messageChunks[chunkIndex];
      const recipientChunk = recipientChunks[chunkIndex];

      let chunkResults: ExpoResponseItem[] = [];
      try {
        chunkResults = await sendExpoBatchWithRetry(messageChunk);
      } catch (error) {
        const chunkError = error instanceof Error ? error.message : String(error);
        for (const recipient of recipientChunk) {
          failed += 1;
          attemptLogs.push({
            run_id: runId ?? "",
            user_id: recipient.userId,
            expo_push_token: recipient.token,
            local_date: recipient.localDate,
            local_time: recipient.localTime,
            timezone: recipient.timezone,
            status: "failed",
            error_code: "ExpoBatchError",
            error_message: chunkError,
          });
        }
        continue;
      }

      for (let index = 0; index < chunkResults.length; index += 1) {
        const result = chunkResults[index];
        const recipient = recipientChunk[index];
        if (!recipient) {
          continue;
        }

        if (result.status === "ok") {
          sent += 1;
          successRecipients.push(recipient);
          attemptLogs.push({
            run_id: runId ?? "",
            user_id: recipient.userId,
            expo_push_token: recipient.token,
            local_date: recipient.localDate,
            local_time: recipient.localTime,
            timezone: recipient.timezone,
            status: "sent",
            error_code: null,
            error_message: null,
          });
          continue;
        }

        failed += 1;
        const errorCode = result.details?.error ?? "ExpoError";
        const errorMessage = result.message ?? null;

        if (errorCode === "DeviceNotRegistered") {
          const { error } = await supabase
            .from("user_push_prefs")
            .update({ expo_push_token: null })
            .eq("user_id", recipient.userId);
          if (!error) {
            invalidTokensRemoved += 1;
          }
        }

        attemptLogs.push({
          run_id: runId ?? "",
          user_id: recipient.userId,
          expo_push_token: recipient.token,
          local_date: recipient.localDate,
          local_time: recipient.localTime,
          timezone: recipient.timezone,
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
        });
      }
    }

    for (const recipient of successRecipients) {
      await supabase
        .from("user_push_prefs")
        .update({ last_sent_for_date: recipient.localDate })
        .eq("user_id", recipient.userId);
    }

    if (runId) {
      await insertAttemptLogs(
        supabase,
        attemptLogs.map((row) => ({ ...row, run_id: runId })),
      );
    }

    await finalizeRunLog(supabase, runId, {
      status: "ok",
      recipientsMatched,
      sentCount: sent,
      failedCount: failed,
      invalidTokensRemoved,
      durationMs: Date.now() - startedAt,
    });

    return json(200, {
      ok: true,
      dryRun: false,
      briefDate: brief.brief_date,
      recipientsMatched,
      sent,
      failed,
      invalidTokensRemoved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push delivery failed.";
    await finalizeRunLog(supabase, runId, {
      status: "error",
      recipientsMatched,
      sentCount: sent,
      failedCount: failed,
      invalidTokensRemoved,
      durationMs: Date.now() - startedAt,
      errorText: message,
    });

    console.error("[send-daily-brief] failed", { message });
    return json(500, { error: message });
  }
});
