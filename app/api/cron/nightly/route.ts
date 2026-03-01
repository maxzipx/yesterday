import { NextRequest, NextResponse } from "next/server";
import { clusterArticlesForWindowDate } from "@/lib/pipeline/cluster";
import { generateDraftFromTopClusters, getYesterdayUtcDateInput } from "@/lib/pipeline/generate-draft";
import { ingestRssForWindowDate } from "@/lib/pipeline/ingest-rss";
import { rankClustersForWindowDate } from "@/lib/pipeline/rank";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type NightlyRequestBody = {
  windowDate?: string;
};

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

async function runNightly(request: NextRequest, windowDateInput?: string) {
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
  const windowDate = windowDateInput?.trim() || getYesterdayUtcDateInput();

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

export async function GET(request: NextRequest) {
  const windowDate = request.nextUrl.searchParams.get("windowDate")?.trim();
  return runNightly(request, windowDate);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as NightlyRequestBody;
  return runNightly(request, body.windowDate);
}
