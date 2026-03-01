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

type ExpoResponseItem = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

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

Deno.serve(async (request) => {
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

  const { data: briefData, error: briefError } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (briefError) {
    return json(500, { error: `Failed loading published brief: ${briefError.message}` });
  }

  if (!briefData) {
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

  const brief = briefData as DailyBrief;

  const { data: prefData, error: prefError } = await supabase
    .from("user_push_prefs")
    .select(
      "user_id, expo_push_token, notifications_enabled, notify_time_local, timezone, last_sent_for_date",
    )
    .eq("notifications_enabled", true)
    .not("expo_push_token", "is", null);

  if (prefError) {
    return json(500, { error: `Failed loading push prefs: ${prefError.message}` });
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
    if (local.time !== targetTime) {
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

  if (dueRecipients.length === 0) {
    return json(200, {
      ok: true,
      dryRun,
      briefDate: brief.brief_date,
      recipientsMatched: 0,
      sent: 0,
      failed: 0,
      invalidTokensRemoved: 0,
      message: "No recipients due at this minute.",
    });
  }

  const messageTitle = "Yesterday Brief";
  const messageBody = brief.title
    ? `${brief.title} is ready.`
    : `Your brief for ${brief.brief_date} is ready.`;

  if (dryRun) {
    return json(200, {
      ok: true,
      dryRun: true,
      briefDate: brief.brief_date,
      recipientsMatched: dueRecipients.length,
      sampleRecipient: dueRecipients[0],
      messageTitle,
      messageBody,
    });
  }

  const tokenToRecipient = new Map(dueRecipients.map((recipient) => [recipient.token, recipient]));
  const messages = dueRecipients.map((recipient) => ({
    to: recipient.token,
    title: messageTitle,
    body: messageBody,
    sound: "default",
    data: {
      briefDate: brief.brief_date,
      briefId: brief.id,
    },
  }));

  const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!expoResponse.ok) {
    const text = await expoResponse.text();
    return json(502, { error: `Expo push API failed (${expoResponse.status}): ${text}` });
  }

  const payload = (await expoResponse.json()) as { data?: ExpoResponseItem[] };
  const resultItems = payload.data ?? [];

  let sent = 0;
  let failed = 0;
  let invalidTokensRemoved = 0;
  const successRecipients: DueRecipient[] = [];

  for (let index = 0; index < resultItems.length; index += 1) {
    const item = resultItems[index];
    const token = messages[index]?.to;
    const recipient = token ? tokenToRecipient.get(token) : undefined;

    if (!recipient) {
      continue;
    }

    if (item.status === "ok") {
      sent += 1;
      successRecipients.push(recipient);
      continue;
    }

    failed += 1;
    if (item.details?.error === "DeviceNotRegistered") {
      const { error } = await supabase
        .from("user_push_prefs")
        .update({ expo_push_token: null })
        .eq("user_id", recipient.userId);
      if (!error) {
        invalidTokensRemoved += 1;
      }
    }
  }

  for (const recipient of successRecipients) {
    await supabase
      .from("user_push_prefs")
      .update({ last_sent_for_date: recipient.localDate })
      .eq("user_id", recipient.userId);
  }

  return json(200, {
    ok: true,
    dryRun: false,
    briefDate: brief.brief_date,
    recipientsMatched: dueRecipients.length,
    sent,
    failed,
    invalidTokensRemoved,
  });
});
