import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import {
  generateDraftFromTopClusters,
  getYesterdayUtcDateInput,
} from "@/lib/pipeline/generate-draft";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type GenerateDraftRequestBody = {
  windowDate?: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateDraftRequestBody;
  const windowDate = body.windowDate?.trim() || getYesterdayUtcDateInput();

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  try {
    const result = await generateDraftFromTopClusters(supabase, windowDate);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generate draft failed." },
      { status: 500 },
    );
  }
}
