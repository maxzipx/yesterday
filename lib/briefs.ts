import type { Database, Json } from "@/lib/supabase/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type BriefSource = {
  label: string;
  url: string;
};

export type BriefStory = {
  id: string;
  position: number;
  headline: string;
  summary: string;
  sources: BriefSource[];
};

export type BriefRecord = {
  id: string;
  date: string;
  title: string | null;
};

export type BriefWithStories = BriefRecord & {
  stories: BriefStory[];
};

type DailyBriefRow = Database["public"]["Tables"]["daily_briefs"]["Row"];
type StoryRow = Database["public"]["Tables"]["brief_stories"]["Row"];

const BRIEF_FIELDS = "id, brief_date, title, status";
const STORY_FIELDS = "id, brief_id, position, headline, summary, sources";

function toSources(raw: Json): BriefSource[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "label" in item &&
      "url" in item &&
      typeof item.label === "string" &&
      typeof item.url === "string" &&
      item.label.trim().length > 0 &&
      item.url.trim().length > 0
    ) {
      return [{ label: item.label.trim(), url: item.url.trim() }];
    }

    return [];
  });
}

function mapBriefRow(row: DailyBriefRow): BriefRecord {
  return {
    id: row.id,
    date: row.brief_date,
    title: row.title,
  };
}

function mapStoryRow(row: StoryRow): BriefStory {
  return {
    id: row.id,
    position: row.position,
    headline: row.headline,
    summary: row.summary,
    sources: toSources(row.sources),
  };
}

async function fetchStoriesForBrief(briefId: string): Promise<BriefStory[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("brief_stories")
    .select(STORY_FIELDS)
    .eq("brief_id", briefId)
    .order("position", { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(`Failed to fetch brief stories: ${error.message}`);
  }

  return ((data ?? []) as StoryRow[]).map(mapStoryRow);
}

export async function getPublishedBriefs(): Promise<BriefRecord[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_briefs")
    .select(BRIEF_FIELDS)
    .eq("status", "published")
    .order("brief_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch published briefs: ${error.message}`);
  }

  return ((data ?? []) as DailyBriefRow[]).map(mapBriefRow);
}

export async function getLatestPublishedBrief(): Promise<BriefWithStories | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_briefs")
    .select(BRIEF_FIELDS)
    .eq("status", "published")
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch latest published brief: ${error.message}`);
  }

  const row = (data as DailyBriefRow | null) ?? null;
  if (!row) {
    return null;
  }

  const stories = await fetchStoriesForBrief(row.id);
  return {
    ...mapBriefRow(row),
    stories,
  };
}

export async function getPublishedBriefByDate(
  date: string,
): Promise<BriefWithStories | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_briefs")
    .select(BRIEF_FIELDS)
    .eq("status", "published")
    .eq("brief_date", date)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch published brief by date: ${error.message}`);
  }

  const row = (data as DailyBriefRow | null) ?? null;
  if (!row) {
    return null;
  }

  const stories = await fetchStoriesForBrief(row.id);
  return {
    ...mapBriefRow(row),
    stories,
  };
}
