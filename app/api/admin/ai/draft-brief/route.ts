import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import {
  AdminAiDraftError,
  draftStoryForBrief,
  type DraftedStory,
} from "@/lib/admin-ai-draft";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONCURRENCY = 2;

type DraftBriefRequestBody = {
  briefId?: string;
};

type BriefStoryRef = Pick<
  Database["public"]["Tables"]["brief_stories"]["Row"],
  "id" | "brief_id" | "position" | "cluster_id"
>;

type StoryStatus = {
  storyId: string;
  position: number;
  ok: boolean;
  message: string;
};

async function loadBriefStories(
  supabase: SupabaseClient<Database>,
  briefId: string,
): Promise<BriefStoryRef[]> {
  const { data, error } = await supabase
    .from("brief_stories")
    .select("id, brief_id, position, cluster_id")
    .eq("brief_id", briefId)
    .order("position", { ascending: true });

  if (error) {
    throw new AdminAiDraftError(500, `Failed to load brief stories: ${error.message}`);
  }

  return (data ?? []) as BriefStoryRef[];
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as DraftBriefRequestBody;
  const briefId = body.briefId?.trim();
  if (!briefId) {
    return NextResponse.json({ error: "briefId is required." }, { status: 400 });
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  try {
    const stories = await loadBriefStories(supabase, briefId);
    if (stories.length === 0) {
      return NextResponse.json(
        { error: "No stories found for this brief." },
        { status: 404 },
      );
    }

    const queue = [...stories];
    const statuses: StoryStatus[] = [];
    const updatedStories: DraftedStory[] = [];

    const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }).map(
      async () => {
        while (queue.length > 0) {
          const story = queue.shift();
          if (!story) {
            return;
          }

          if (!story.cluster_id) {
            statuses.push({
              storyId: story.id,
              position: story.position,
              ok: false,
              message: "No cluster assigned.",
            });
            continue;
          }

          try {
            const updated = await draftStoryForBrief(supabase, briefId, story.id);
            updatedStories.push(updated);
            statuses.push({
              storyId: story.id,
              position: story.position,
              ok: true,
              message: "Drafted",
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown AI drafting error.";

            statuses.push({
              storyId: story.id,
              position: story.position,
              ok: false,
              message,
            });
          }
        }
      },
    );

    await Promise.all(workers);

    statuses.sort((a, b) => a.position - b.position);
    updatedStories.sort((a, b) => a.position - b.position);

    return NextResponse.json({
      briefId,
      statuses,
      stories: updatedStories,
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
