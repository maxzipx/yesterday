import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import {
  AdminAiDraftError,
  draftBriefWithAi,
} from "@/lib/admin-ai-draft";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftBriefRequestBody = {
  briefId?: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rate = checkRateLimit(`ai:draft-brief:${auth.userId}`, 8, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Too many AI brief draft requests. Try again in ${rate.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const body = (await request.json().catch(() => ({}))) as DraftBriefRequestBody;
  const briefId = body.briefId?.trim();
  if (!briefId) {
    return NextResponse.json({ error: "briefId is required." }, { status: 400 });
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  try {
    const result = await draftBriefWithAi(supabase, briefId, 2);

    return NextResponse.json({
      briefId,
      statuses: result.statuses,
      stories: result.stories,
    });
  } catch (error) {
    if (error instanceof AdminAiDraftError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to draft brief." },
      { status: 500 },
    );
  }
}
