const BASE_URL = process.env.BASE_URL?.trim() || "http://127.0.0.1:3000";
const ADMIN_BEARER = process.env.WEEK3_ADMIN_BEARER?.trim() || "";
const BRIEF_ID = process.env.WEEK3_BRIEF_ID?.trim() || "";
const STORY_ID = process.env.WEEK3_STORY_ID?.trim() || "";

async function fetchJson(path, init = {}, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function printResult(label, pass, details) {
  const marker = pass ? "PASS" : "FAIL";
  console.log(`[${marker}] ${label}`);
  if (details) {
    console.log(`  ${details}`);
  }
}

async function main() {
  let failureCount = 0;

  const unauthPing = await fetchJson("/api/admin/ai/ping", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const unauthPass = unauthPing.status === 401;
  if (!unauthPass) {
    failureCount += 1;
  }
  printResult(
    "Unauthenticated AI ping blocked",
    unauthPass,
    `status=${unauthPing.status}`,
  );

  if (!ADMIN_BEARER) {
    console.log(
      "WEEK3_ADMIN_BEARER not provided. Skipping authenticated smoke checks.",
    );
    process.exit(failureCount > 0 ? 1 : 0);
  }

  const authPing = await fetchJson(
    "/api/admin/ai/ping",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
      body: JSON.stringify({}),
    },
    120_000,
  );

  const authPingPass = authPing.ok && authPing.payload?.ok === true;
  if (!authPingPass) {
    failureCount += 1;
  }
  printResult(
    "Authenticated AI ping works",
    authPingPass,
    `status=${authPing.status}`,
  );

  if (BRIEF_ID && STORY_ID) {
    const storyDraft = await fetchJson(
      "/api/admin/ai/draft-story",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
        body: JSON.stringify({ briefId: BRIEF_ID, storyId: STORY_ID }),
      },
      300_000,
    );

    const storyDraftPass = storyDraft.ok && Boolean(storyDraft.payload?.story?.summary);
    if (!storyDraftPass) {
      failureCount += 1;
    }
    printResult(
      "Single story AI draft works",
      storyDraftPass,
      `status=${storyDraft.status}`,
    );
  } else {
    console.log(
      "WEEK3_BRIEF_ID and WEEK3_STORY_ID not provided. Skipping draft-story smoke check.",
    );
  }

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

