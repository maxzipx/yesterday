import { NextRequest, NextResponse } from "next/server";
import { clusterArticlesForWindowDate } from "@/app/api/admin/cluster/route";
import { generateDraftFromTopClusters } from "@/app/api/admin/generate-draft/route";
import { ingestRssForWindowDate } from "@/app/api/admin/ingest-rss/route";
import { rankClustersForWindowDate } from "@/app/api/admin/rank/route";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type NightlyRequestBody = {
  windowDate?: string;
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

function extractCronSecret(request: NextRequest): string | null {
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

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  const providedSecret = extractCronSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as NightlyRequestBody;
  const windowDate = body.windowDate?.trim() || getYesterdayUtcDateInput();

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceRoleClient();

  try {
    const ingest = await ingestRssForWindowDate(supabase, windowDate);
    const cluster = await clusterArticlesForWindowDate(supabase, windowDate, true);
    const rank = await rankClustersForWindowDate(supabase, windowDate);
    const draft = await generateDraftFromTopClusters(supabase, windowDate);

    const summary = {
      windowDate,
      ingest,
      cluster,
      rank,
      draft,
    };

    console.log("[cron/nightly] Pipeline completed", summary);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nightly pipeline failed.";
    console.error("[cron/nightly] Pipeline failed", { windowDate, error: message });
    return NextResponse.json({ error: message, windowDate }, { status: 500 });
  }
}
