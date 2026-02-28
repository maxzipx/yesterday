import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BriefRow = Database["public"]["Tables"]["daily_briefs"]["Row"];
type StoryRow = Database["public"]["Tables"]["brief_stories"]["Row"];
type StoryInsert = Database["public"]["Tables"]["brief_stories"]["Insert"];
type ServerClient = SupabaseClient<Database>;

type SourceInput = {
  label: string;
  url: string;
};

type StoryInput = {
  position: number;
  headline: string;
  summary: string;
  whyItMatters?: string | null;
  sources?: SourceInput[];
};

type BriefAction = "create_draft" | "save_draft" | "publish" | "unpublish";

type BriefMutationRequest = {
  action: BriefAction;
  date: string;
  title?: string | null;
  stories?: StoryInput[];
};

type StoryFieldErrors = Record<number, { headline?: string; summary?: string }>;

function isValidDateInput(date: string): boolean {
  return DATE_PATTERN.test(date);
}

function normalizeSources(raw: Json): SourceInput[] {
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

function sanitizeSources(input: SourceInput[] | undefined): SourceInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((source) => ({
      label: source.label.trim(),
      url: source.url.trim(),
    }))
    .filter((source) => source.label.length > 0 || source.url.length > 0);
}

function normalizeStoryInput(story: StoryInput) {
  return {
    position: story.position,
    headline: story.headline.trim(),
    summary: story.summary.trim(),
    whyItMatters: story.whyItMatters?.trim() || null,
    sources: sanitizeSources(story.sources),
  };
}

function validateStoryPositions(stories: StoryInput[] | undefined): string | null {
  if (!stories || stories.length !== 5) {
    return "Exactly 5 stories are required.";
  }

  const positionSet = new Set(stories.map((story) => story.position));
  for (let position = 1; position <= 5; position += 1) {
    if (!positionSet.has(position)) {
      return "Stories must include positions 1 through 5.";
    }
  }

  return null;
}

function validatePublishFields(
  stories: ReturnType<typeof normalizeStoryInput>[],
): StoryFieldErrors {
  const errors: StoryFieldErrors = {};

  for (const story of stories) {
    const storyErrors: { headline?: string; summary?: string } = {};

    if (!story.headline) {
      storyErrors.headline = "Headline is required before publishing.";
    }

    if (!story.summary) {
      storyErrors.summary = "Summary is required before publishing.";
    }

    if (storyErrors.headline || storyErrors.summary) {
      errors[story.position] = storyErrors;
    }
  }

  return errors;
}

async function getBriefByDate(
  supabase: ServerClient,
  date: string,
): Promise<BriefRow | null> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, status, title, published_at, created_at, updated_at")
    .eq("brief_date", date)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load brief: ${error.message}`);
  }

  return (data as BriefRow | null) ?? null;
}

async function getStoriesForBrief(
  supabase: ServerClient,
  briefId: string,
): Promise<StoryRow[]> {
  const { data, error } = await supabase
    .from("brief_stories")
    .select(
      "id, brief_id, position, headline, summary, why_it_matters, sources, created_at, updated_at",
    )
    .eq("brief_id", briefId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed to load brief stories: ${error.message}`);
  }

  return (data ?? []) as StoryRow[];
}

async function fillMissingStories(
  supabase: ServerClient,
  briefId: string,
  existing: StoryRow[],
) {
  const positions = new Set(existing.map((story) => story.position));
  const missing: StoryInsert[] = [];

  for (let position = 1; position <= 5; position += 1) {
    if (!positions.has(position)) {
      missing.push({
        brief_id: briefId,
        position,
        headline: "",
        summary: "",
        why_it_matters: null,
        sources: [] as Json,
      });
    }
  }

  if (missing.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("brief_stories")
    .upsert(missing, { onConflict: "brief_id,position" });

  if (error) {
    throw new Error(`Failed to create missing story rows: ${error.message}`);
  }
}

async function createDraft(
  supabase: ServerClient,
  date: string,
): Promise<BriefRow> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .insert({
      brief_date: date,
      status: "draft",
      title: null,
      published_at: null,
    })
    .select("id, brief_date, status, title, published_at, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to create draft: ${error.message}`);
  }

  const brief = data as BriefRow;
  await fillMissingStories(supabase, brief.id, []);
  return brief;
}

async function upsertStories(
  supabase: ServerClient,
  briefId: string,
  stories: StoryInput[],
) {
  const normalizedStories = stories.map(normalizeStoryInput);
  const payload: StoryInsert[] = normalizedStories.map((story) => ({
    brief_id: briefId,
    position: story.position,
    headline: story.headline,
    summary: story.summary,
    why_it_matters: story.whyItMatters,
    sources: story.sources as Json,
  }));

  const { error } = await supabase
    .from("brief_stories")
    .upsert(payload, { onConflict: "brief_id,position" });

  if (error) {
    throw new Error(`Failed to save stories: ${error.message}`);
  }
}

function mapEditorPayload(brief: BriefRow, stories: StoryRow[]) {
  return {
    id: brief.id,
    date: brief.brief_date,
    status: brief.status,
    title: brief.title,
    publishedAt: brief.published_at,
    stories: stories.map((story) => ({
      id: story.id,
      position: story.position,
      headline: story.headline,
      summary: story.summary,
      whyItMatters: story.why_it_matters,
      sources: normalizeSources(story.sources),
    })),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  const date = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!isValidDateInput(date)) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  const brief = await getBriefByDate(supabase, date);
  if (!brief) {
    return NextResponse.json({ brief: null });
  }

  const stories = await getStoriesForBrief(supabase, brief.id);
  await fillMissingStories(supabase, brief.id, stories);
  const refreshedStories = await getStoriesForBrief(supabase, brief.id);

  return NextResponse.json({
    brief: mapEditorPayload(brief, refreshedStories),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  const body = (await request.json()) as BriefMutationRequest;
  const date = body.date?.trim() ?? "";
  const action = body.action;

  if (!isValidDateInput(date)) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  if (!action) {
    return NextResponse.json({ error: "Action is required." }, { status: 400 });
  }

  if (action === "create_draft") {
    let brief = await getBriefByDate(supabase, date);
    if (!brief) {
      brief = await createDraft(supabase, date);
    }

    const stories = await getStoriesForBrief(supabase, brief.id);
    await fillMissingStories(supabase, brief.id, stories);
    const refreshedStories = await getStoriesForBrief(supabase, brief.id);
    return NextResponse.json({ brief: mapEditorPayload(brief, refreshedStories) });
  }

  const positionError = validateStoryPositions(body.stories);
  if (positionError) {
    return NextResponse.json({ error: positionError }, { status: 400 });
  }

  const normalizedStories = (body.stories ?? []).map(normalizeStoryInput);
  if (action === "publish") {
    const fieldErrors = validatePublishFields(normalizedStories);
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          error: "Fix required fields before publishing.",
          storyErrors: fieldErrors,
        },
        { status: 400 },
      );
    }
  }

  const title = body.title?.trim() || null;
  let brief = await getBriefByDate(supabase, date);

  const existingPublishedAt = brief?.published_at ?? null;
  let nextStatus: BriefRow["status"] = "draft";
  let nextPublishedAt: string | null = null;

  if (action === "publish") {
    nextStatus = "published";
    nextPublishedAt = new Date().toISOString();
  } else if (action === "save_draft") {
    nextStatus = brief?.status === "published" ? "published" : "draft";
    nextPublishedAt = brief?.status === "published" ? existingPublishedAt : null;
  } else if (action === "unpublish") {
    nextStatus = "draft";
    nextPublishedAt = null;
  }

  if (!brief) {
    const { data, error } = await supabase
      .from("daily_briefs")
      .insert({
        brief_date: date,
        status: nextStatus,
        title,
        published_at: nextPublishedAt,
      })
      .select("id, brief_date, status, title, published_at, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create brief: ${error.message}` },
        { status: 500 },
      );
    }

    brief = data as BriefRow;
  } else {
    const { data, error } = await supabase
      .from("daily_briefs")
      .update({
        status: nextStatus,
        title,
        published_at: nextPublishedAt,
      })
      .eq("id", brief.id)
      .select("id, brief_date, status, title, published_at, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update brief: ${error.message}` },
        { status: 500 },
      );
    }

    brief = data as BriefRow;
  }

  await upsertStories(supabase, brief.id, body.stories ?? []);
  const savedStories = await getStoriesForBrief(supabase, brief.id);
  await fillMissingStories(supabase, brief.id, savedStories);
  const refreshedStories = await getStoriesForBrief(supabase, brief.id);

  return NextResponse.json({
    brief: mapEditorPayload(brief, refreshedStories),
  });
}
