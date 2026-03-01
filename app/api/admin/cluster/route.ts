import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { clusterArticlesForWindowDate, getYesterdayUtcDateInput } from "@/lib/pipeline/cluster";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ClusterRequestBody = {
  windowDate?: string;
  replace?: boolean;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as ClusterRequestBody;
  const windowDate = body.windowDate?.trim() || getYesterdayUtcDateInput();
  const replace = body.replace ?? true;

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  try {
    const result = await clusterArticlesForWindowDate(supabase, windowDate, replace);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cluster generation failed." },
      { status: 500 },
    );
  }
}
