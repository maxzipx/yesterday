import { NextRequest, NextResponse } from "next/server";
import { clusterArticlesForWindowDate } from "@/app/api/admin/cluster/route";
import { generateDraftFromTopClusters } from "@/app/api/admin/generate-draft/route";
import { ingestRssForWindowDate } from "@/app/api/admin/ingest-rss/route";
import { rankClustersForWindowDate } from "@/app/api/admin/rank/route";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { AdminAiDraftError, draftBriefWithAi } from "@/lib/admin-ai-draft";
import { ollamaChat } from "@/lib/ollama";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type GenerateFullDraftRequestBody = {
  windowDate?: string;
};

type StepStatus = {
  step: "ollama_ping" | "ingest" | "cluster" | "rank" | "generate_draft" | "draft_with_ai";
  ok: boolean;
  message: string;
  durationMs: number;
};

function getYesterdayUtcDateInput(): string {
  const now = new Date();
  const yesterdayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const year = yesterdayUtc.getUTCFullYear();
  const month = String(yesterdayUtc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(yesterdayUtc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rate = checkRateLimit(`pipeline:full-draft:${auth.userId}`, 6, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Too many full draft runs. Try again in ${rate.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const body = (await request.json().catch(() => ({}))) as GenerateFullDraftRequestBody;
  const windowDate = body.windowDate?.trim() || getYesterdayUtcDateInput();

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);
  const statuses: StepStatus[] = [];
  let activeStep: StepStatus["step"] = "ollama_ping";

  try {
    activeStep = "ollama_ping";
    const pingStartedAt = Date.now();
    const ping = await ollamaChat({
      messages: [{ role: "user", content: "Respond with: OK" }],
      temperature: 0,
      timeoutMs: 25_000,
    });
    statuses.push({
      step: "ollama_ping",
      ok: true,
      durationMs: Date.now() - pingStartedAt,
      message: `Ollama reachable (${ping.content.slice(0, 40)}).`,
    });

    activeStep = "ingest";
    const ingestStartedAt = Date.now();
    const ingest = await ingestRssForWindowDate(supabase, windowDate);
    statuses.push({
      step: "ingest",
      ok: true,
      durationMs: Date.now() - ingestStartedAt,
      message: `${ingest.feedsProcessed} feeds processed, ${ingest.newArticlesInserted} new articles, ${ingest.duplicatesSkipped} duplicates.`,
    });

    activeStep = "cluster";
    const clusterStartedAt = Date.now();
    const cluster = await clusterArticlesForWindowDate(supabase, windowDate, true);
    statuses.push({
      step: "cluster",
      ok: true,
      durationMs: Date.now() - clusterStartedAt,
      message: `${cluster.articlesConsidered} articles considered, ${cluster.clustersCreated} clusters created.`,
    });

    activeStep = "rank";
    const rankStartedAt = Date.now();
    const rank = await rankClustersForWindowDate(supabase, windowDate);
    statuses.push({
      step: "rank",
      ok: true,
      durationMs: Date.now() - rankStartedAt,
      message: `${rank.clustersConsidered} clusters ranked, ${rank.candidatesSaved} candidates saved.`,
    });

    activeStep = "generate_draft";
    const draftStartedAt = Date.now();
    const draft = await generateDraftFromTopClusters(supabase, windowDate);
    statuses.push({
      step: "generate_draft",
      ok: true,
      durationMs: Date.now() - draftStartedAt,
      message: `Draft ${draft.briefId} created for ${draft.windowDate}.`,
    });

    activeStep = "draft_with_ai";
    const aiStartedAt = Date.now();
    const aiDraft = await draftBriefWithAi(supabase, draft.briefId, 1);
    const failedAi = aiDraft.statuses.filter((status) => !status.ok);
    if (failedAi.length > 0) {
      const failureSummary = failedAi
        .map((status) => `Story ${status.position}: ${status.message}`)
        .join(" | ");
      throw new Error(`AI drafting failed for one or more stories. ${failureSummary}`);
    }

    statuses.push({
      step: "draft_with_ai",
      ok: true,
      durationMs: Date.now() - aiStartedAt,
      message: `${aiDraft.stories.length} stories drafted with AI.`,
    });

    console.info("[admin] generate-full-draft completed", {
      userId: auth.userId,
      briefId: draft.briefId,
      briefDate: windowDate,
      statuses,
    });

    return NextResponse.json({
      briefId: draft.briefId,
      briefDate: windowDate,
      statuses,
      stories: aiDraft.stories,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generate full draft failed.";

    if (
      statuses.length === 0 ||
      statuses[statuses.length - 1].ok ||
      statuses[statuses.length - 1].message !== message
    ) {
      statuses.push({
        step: activeStep,
        ok: false,
        durationMs: 0,
        message,
      });
    }

    const statusCode =
      error instanceof AdminAiDraftError
        ? error.status
        : message.toLowerCase().includes("not authorized")
          ? 403
          : 500;

    console.error("[admin] generate-full-draft failed", {
      userId: auth.userId,
      briefDate: windowDate,
      message,
      statuses,
    });

    return NextResponse.json({ error: message, statuses, briefDate: windowDate }, { status: statusCode });
  }
}
