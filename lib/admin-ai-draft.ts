import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAiFlags } from "@/lib/ai-flags";
import { generateStoryDraftFromCluster } from "@/lib/storyDraft";
import type { Database, Json } from "@/lib/supabase/types";

type BriefStoryRow = Database["public"]["Tables"]["brief_stories"]["Row"];
type BriefStoryRef = Pick<BriefStoryRow, "id" | "brief_id" | "position" | "cluster_id">;

const DEFAULT_MAX_CONCURRENCY = 2;

export class AdminAiDraftError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type DraftedStory = {
  id: string;
  briefId: string;
  position: number;
  clusterId: string | null;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  confidence: number | null;
  flags: string[];
};

export type StoryDraftStatus = {
  storyId: string;
  position: number;
  ok: boolean;
  message: string;
};

function normalizeFlags(raw: Json): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function mapDraftedStory(row: BriefStoryRow): DraftedStory {
  return {
    id: row.id,
    briefId: row.brief_id,
    position: row.position,
    clusterId: row.cluster_id,
    headline: row.headline,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    confidence: row.confidence,
    flags: normalizeAiFlags(normalizeFlags(row.flags)),
  };
}

export async function draftStoryForBrief(
  supabase: SupabaseClient<Database>,
  briefId: string,
  storyId: string,
): Promise<DraftedStory> {
  const { data: storyData, error: storyError } = await supabase
    .from("brief_stories")
    .select(
      "id, brief_id, position, cluster_id, headline, summary, why_it_matters, confidence, flags, sources, created_at, updated_at",
    )
    .eq("id", storyId)
    .maybeSingle();

  if (storyError) {
    throw new AdminAiDraftError(500, `Failed to load story: ${storyError.message}`);
  }

  const story = (storyData as BriefStoryRow | null) ?? null;
  if (!story) {
    throw new AdminAiDraftError(404, "Story not found.");
  }

  if (story.brief_id !== briefId) {
    throw new AdminAiDraftError(400, "Story does not belong to this brief.");
  }

  if (!story.cluster_id) {
    throw new AdminAiDraftError(400, "No cluster assigned.");
  }

  const generated = await generateStoryDraftFromCluster(story.cluster_id, supabase);

  const { data: updatedData, error: updateError } = await supabase
    .from("brief_stories")
    .update({
      headline: generated.headline,
      summary: generated.summary,
      why_it_matters: generated.why_it_matters,
      confidence: generated.confidence,
      flags: generated.flags as Json,
    })
    .eq("id", story.id)
    .select(
      "id, brief_id, position, cluster_id, headline, summary, why_it_matters, confidence, flags, sources, created_at, updated_at",
    )
    .single();

  if (updateError) {
    throw new AdminAiDraftError(500, `Failed to update story draft: ${updateError.message}`);
  }

  return mapDraftedStory(updatedData as BriefStoryRow);
}

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

export async function draftBriefWithAi(
  supabase: SupabaseClient<Database>,
  briefId: string,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
): Promise<{ statuses: StoryDraftStatus[]; stories: DraftedStory[] }> {
  const stories = await loadBriefStories(supabase, briefId);
  if (stories.length === 0) {
    throw new AdminAiDraftError(404, "No stories found for this brief.");
  }

  const queue = [...stories];
  const statuses: StoryDraftStatus[] = [];
  const updatedStories: DraftedStory[] = [];
  const workerCount = Math.max(1, Math.min(maxConcurrency, queue.length));

  const workers = Array.from({ length: workerCount }).map(async () => {
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

      const startedAt = Date.now();
      try {
        const updated = await draftStoryForBrief(supabase, briefId, story.id);
        const durationMs = Date.now() - startedAt;
        console.info("[admin-ai] drafted story", {
          briefId,
          storyId: story.id,
          position: story.position,
          durationMs,
        });

        updatedStories.push(updated);
        statuses.push({
          storyId: story.id,
          position: story.position,
          ok: true,
          message: "Drafted",
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : "Unknown AI drafting error.";
        console.error("[admin-ai] draft story failed", {
          briefId,
          storyId: story.id,
          position: story.position,
          durationMs,
          message,
        });

        statuses.push({
          storyId: story.id,
          position: story.position,
          ok: false,
          message,
        });
      }
    }
  });

  await Promise.all(workers);
  statuses.sort((a, b) => a.position - b.position);
  updatedStories.sort((a, b) => a.position - b.position);

  return {
    statuses,
    stories: updatedStories,
  };
}
