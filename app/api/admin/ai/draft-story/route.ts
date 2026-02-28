import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { AdminAiDraftError, draftStoryForBrief } from "@/lib/admin-ai-draft";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftStoryRequestBody = {
  briefId?: string;
  storyId?: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as DraftStoryRequestBody;
  const briefId = body.briefId?.trim();
  const storyId = body.storyId?.trim();

  if (!briefId || !storyId) {
    return NextResponse.json(
      { error: "briefId and storyId are required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  try {
    const story = await draftStoryForBrief(supabase, briefId, storyId);
    return NextResponse.json({ story });
  } catch (error) {
    if (error instanceof AdminAiDraftError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate AI story draft.",
      },
      { status: 500 },
    );
  }
}
