import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Database } from "@/lib/supabase/types";

export type BriefSource = {
  label: string;
  url: string;
};

export type BriefStory = {
  headline: string;
  summary: string;
  whyItMatters: string | null;
  sources: BriefSource[];
  position: number;
};

export type Brief = {
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  stories: BriefStory[];
};

type DailyBriefRow = Database["public"]["Tables"]["daily_briefs"]["Row"];
type StoryRow = Database["public"]["Tables"]["brief_stories"]["Row"];

const mockPublishedBriefs: Brief[] = [
  {
    date: "2026-02-26",
    title: "State Policy Signals and Market Impact",
    summary:
      "A quick review of policy signals, business moves, and notable sentiment shifts from the last 24 hours.",
    highlights: [
      "Regulatory updates pointed to slower near-term approvals in two sectors.",
      "Major retailers reported cautious but stable demand in weekly commentary.",
      "Macro data release schedule suggests a quiet opening to next week.",
    ],
    stories: [],
  },
  {
    date: "2026-02-25",
    title: "Earnings Momentum Check",
    summary:
      "Published companies showed mixed guidance while operational cost control remained a common positive theme.",
    highlights: [
      "Guidance revisions were narrow, with fewer large downside surprises.",
      "Operational margin stability improved in software and logistics.",
      "Hiring commentary remained conservative across most management calls.",
    ],
    stories: [],
  },
  {
    date: "2026-02-24",
    title: "Infrastructure and Energy Roundup",
    summary:
      "Infrastructure projects continue progressing while energy pricing stayed within a tighter trading range.",
    highlights: [
      "Two large procurement announcements accelerated regional timelines.",
      "Forward pricing indicated less volatility than earlier in the month.",
      "Capital project financing conditions remained generally supportive.",
    ],
    stories: [],
  },
  {
    date: "2026-02-23",
    title: "Consumer Watch",
    summary:
      "A pulse check on consumer behavior, discretionary spend, and early spring inventory positioning.",
    highlights: [
      "Category-level demand was strongest in essentials and health products.",
      "Promotional cadence remained elevated but less aggressive week over week.",
      "Brands continued prioritizing inventory discipline over top-line growth.",
    ],
    stories: [],
  },
];

const briefFields =
  "id, brief_date, status, title, published_at, created_at, updated_at";

const storyFields =
  "id, brief_id, position, headline, summary, why_it_matters, sources, created_at, updated_at";

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
      typeof item.url === "string"
    ) {
      return [{ label: item.label, url: item.url }];
    }

    return [];
  });
}

function mapBrief(brief: DailyBriefRow, stories: StoryRow[]): Brief {
  const orderedStories = [...stories].sort((a, b) => a.position - b.position);
  const mappedStories: BriefStory[] = orderedStories.map((story) => ({
    headline: story.headline,
    summary: story.summary,
    whyItMatters: story.why_it_matters,
    sources: toSources(story.sources),
    position: story.position,
  }));

  return {
    date: brief.brief_date,
    title: brief.title ?? `Daily Brief ${brief.brief_date}`,
    summary: mappedStories[0]?.summary ?? "No summary is available yet.",
    highlights: mappedStories.slice(0, 3).map((story) => story.headline),
    stories: mappedStories,
  };
}

function getMockPublishedBriefs(): Brief[] {
  return mockPublishedBriefs;
}

function getMockBriefByDate(date: string): Brief | undefined {
  return mockPublishedBriefs.find((brief) => brief.date === date);
}

async function fetchStoriesByBriefIds(
  briefIds: string[],
): Promise<Map<string, StoryRow[]>> {
  const storiesByBriefId = new Map<string, StoryRow[]>();

  if (briefIds.length === 0) {
    return storiesByBriefId;
  }

  const supabase = getSupabaseServerClient();
  const { data: stories, error } = await supabase
    .from("brief_stories")
    .select(storyFields)
    .in("brief_id", briefIds)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const storyRows = (stories ?? []) as StoryRow[];

  for (const story of storyRows) {
    const current = storiesByBriefId.get(story.brief_id) ?? [];
    current.push(story);
    storiesByBriefId.set(story.brief_id, current);
  }

  return storiesByBriefId;
}

export async function getPublishedBriefs(): Promise<Brief[]> {
  if (!isSupabaseConfigured()) {
    return getMockPublishedBriefs();
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: briefs, error } = await supabase
      .from("daily_briefs")
      .select(briefFields)
      .eq("status", "published")
      .order("brief_date", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (briefs ?? []) as DailyBriefRow[];
    const storiesByBriefId = await fetchStoriesByBriefIds(rows.map((row) => row.id));

    return rows.map((row) => mapBrief(row, storiesByBriefId.get(row.id) ?? []));
  } catch (error) {
    console.error("Falling back to mock published briefs.", error);
    return getMockPublishedBriefs();
  }
}

export async function getLatestPublishedBrief(): Promise<Brief | undefined> {
  if (!isSupabaseConfigured()) {
    return getMockPublishedBriefs()[0];
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: brief, error } = await supabase
      .from("daily_briefs")
      .select(briefFields)
      .eq("status", "published")
      .order("brief_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const briefRow = (brief as DailyBriefRow | null) ?? null;

    if (!briefRow) {
      return undefined;
    }

    const storiesByBriefId = await fetchStoriesByBriefIds([briefRow.id]);
    return mapBrief(briefRow, storiesByBriefId.get(briefRow.id) ?? []);
  } catch (error) {
    console.error("Falling back to mock latest brief.", error);
    return getMockPublishedBriefs()[0];
  }
}

export async function getBriefByDate(date: string): Promise<Brief | undefined> {
  if (!isSupabaseConfigured()) {
    return getMockBriefByDate(date);
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: brief, error } = await supabase
      .from("daily_briefs")
      .select(briefFields)
      .eq("status", "published")
      .eq("brief_date", date)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const briefRow = (brief as DailyBriefRow | null) ?? null;

    if (!briefRow) {
      return undefined;
    }

    const storiesByBriefId = await fetchStoriesByBriefIds([briefRow.id]);
    return mapBrief(briefRow, storiesByBriefId.get(briefRow.id) ?? []);
  } catch (error) {
    console.error(`Falling back to mock brief for ${date}.`, error);
    return getMockBriefByDate(date);
  }
}
