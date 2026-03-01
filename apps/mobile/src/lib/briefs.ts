import { supabase } from "./supabase";
import type { ArchiveItem, BriefWithStories, SourceLink, Story } from "../types/briefs";

function parseSources(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const rawLabel = (item as { label?: unknown }).label;
      const rawUrl = (item as { url?: unknown }).url;
      if (typeof rawLabel !== "string" || typeof rawUrl !== "string") {
        return null;
      }

      const label = rawLabel.trim();
      const url = rawUrl.trim();
      if (!label || !url) {
        return null;
      }

      return { label, url };
    })
    .filter((item): item is SourceLink => Boolean(item));
}

async function fetchStoriesForBrief(briefId: string): Promise<Story[]> {
  const { data, error } = await supabase
    .from("brief_stories")
    .select("id, position, headline, summary, why_it_matters, sources")
    .eq("brief_id", briefId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed loading stories: ${error.message}`);
  }

  return (data ?? []).map((story) => ({
    id: story.id,
    position: story.position,
    headline: story.headline,
    summary: story.summary,
    whyItMatters: story.why_it_matters,
    sources: parseSources(story.sources),
  }));
}

export async function fetchLatestPublishedBrief(): Promise<BriefWithStories | null> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed loading latest brief: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const stories = await fetchStoriesForBrief(data.id);
  return {
    id: data.id,
    briefDate: data.brief_date,
    title: data.title,
    stories,
  };
}

export async function fetchPublishedBriefByDate(date: string): Promise<BriefWithStories | null> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .eq("brief_date", date)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed loading brief: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const stories = await fetchStoriesForBrief(data.id);
  return {
    id: data.id,
    briefDate: data.brief_date,
    title: data.title,
    stories,
  };
}

export async function fetchArchiveList(): Promise<ArchiveItem[]> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .order("brief_date", { ascending: false })
    .limit(180);

  if (error) {
    throw new Error(`Failed loading archive: ${error.message}`);
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    briefDate: item.brief_date,
    title: item.title,
  }));
}
