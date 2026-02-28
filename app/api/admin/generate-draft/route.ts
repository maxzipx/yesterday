import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_STORY_COUNT = 5;

type GenerateDraftRequestBody = {
  windowDate?: string;
};

type CandidateRow = Database["public"]["Tables"]["cluster_candidates"]["Row"];
type ClusterRow = Pick<
  Database["public"]["Tables"]["story_clusters"]["Row"],
  "id" | "label"
>;
type MembershipRow = Database["public"]["Tables"]["cluster_articles"]["Row"];
type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "url" | "publisher" | "source_id" | "published_at"
>;
type SourceRow = Pick<Database["public"]["Tables"]["feed_sources"]["Row"], "id" | "name">;

export type GenerateDraftResult = {
  windowDate: string;
  briefId: string;
  editorLink: string;
};

function formatDateInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYesterdayUtcDateInput(): string {
  const now = new Date();
  const yesterdayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  return formatDateInput(yesterdayUtc);
}

function publisherName(article: ArticleRow, sourceNameById: Map<string, string>): string {
  const publisher = article.publisher?.trim();
  if (publisher) {
    return publisher;
  }

  if (article.source_id) {
    const sourceName = sourceNameById.get(article.source_id)?.trim();
    if (sourceName) {
      return sourceName;
    }
  }

  return "Source";
}

function buildStorySources(
  articles: ArticleRow[],
  sourceNameById: Map<string, string>,
): Array<{ label: string; url: string }> {
  const uniqueByUrl = new Map<string, { label: string; url: string }>();

  const sorted = [...articles].sort((a, b) => {
    if (!a.published_at && !b.published_at) {
      return 0;
    }

    if (!a.published_at) {
      return 1;
    }

    if (!b.published_at) {
      return -1;
    }

    return b.published_at.localeCompare(a.published_at);
  });

  for (const article of sorted) {
    if (uniqueByUrl.has(article.url)) {
      continue;
    }

    uniqueByUrl.set(article.url, {
      label: publisherName(article, sourceNameById),
      url: article.url,
    });
  }

  return [...uniqueByUrl.values()].slice(0, 4);
}

export async function generateDraftFromTopClusters(
  supabase: SupabaseClient<Database>,
  windowDate: string,
): Promise<GenerateDraftResult> {
  const { data: existingBriefData, error: existingBriefError } = await supabase
    .from("daily_briefs")
    .select("id, status, published_at")
    .eq("brief_date", windowDate)
    .maybeSingle();

  if (existingBriefError) {
    throw new Error(`Failed to check existing brief status: ${existingBriefError.message}`);
  }

  if (existingBriefData?.status === "published") {
    throw new Error(
      "A published brief already exists for this date. Unpublish it first or choose another date.",
    );
  }

  const { data: candidateData, error: candidateError } = await supabase
    .from("cluster_candidates")
    .select("id, window_date, cluster_id, rank, created_at")
    .eq("window_date", windowDate)
    .order("rank", { ascending: true })
    .limit(REQUIRED_STORY_COUNT);

  if (candidateError) {
    throw new Error(`Failed to load ranked candidates: ${candidateError.message}`);
  }

  const candidates = (candidateData ?? []) as CandidateRow[];
  if (candidates.length < REQUIRED_STORY_COUNT) {
    throw new Error(
      "Not enough ranked clusters for this date. Run ingest -> cluster -> rank first.",
    );
  }

  const clusterIds = [...new Set(candidates.map((candidate) => candidate.cluster_id))];

  const { data: clusterData, error: clusterError } = await supabase
    .from("story_clusters")
    .select("id, label")
    .in("id", clusterIds);

  if (clusterError) {
    throw new Error(`Failed to load story clusters: ${clusterError.message}`);
  }

  const clusters = (clusterData ?? []) as ClusterRow[];
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));

  const { data: membershipData, error: membershipError } = await supabase
    .from("cluster_articles")
    .select("cluster_id, article_id")
    .in("cluster_id", clusterIds);

  if (membershipError) {
    throw new Error(`Failed to load cluster memberships: ${membershipError.message}`);
  }

  const memberships = (membershipData ?? []) as MembershipRow[];
  const articleIds = [...new Set(memberships.map((membership) => membership.article_id))];

  const { data: articleData, error: articleError } = articleIds.length
    ? await supabase
        .from("articles")
        .select("id, url, publisher, source_id, published_at")
        .in("id", articleIds)
    : { data: [], error: null };

  if (articleError) {
    throw new Error(`Failed to load cluster article details: ${articleError.message}`);
  }

  const articles = (articleData ?? []) as ArticleRow[];
  const articleById = new Map(articles.map((article) => [article.id, article]));

  const sourceIds = [...new Set(
    articles
      .map((article) => article.source_id)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  )];

  const { data: sourceData, error: sourceError } = sourceIds.length
    ? await supabase.from("feed_sources").select("id, name").in("id", sourceIds)
    : { data: [], error: null };

  if (sourceError) {
    throw new Error(`Failed to load source names: ${sourceError.message}`);
  }

  const sources = (sourceData ?? []) as SourceRow[];
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

  const membershipsByCluster = new Map<string, MembershipRow[]>();
  for (const membership of memberships) {
    const rows = membershipsByCluster.get(membership.cluster_id) ?? [];
    rows.push(membership);
    membershipsByCluster.set(membership.cluster_id, rows);
  }

  const topCandidates = [...candidates]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, REQUIRED_STORY_COUNT);
  const storyRows: Database["public"]["Tables"]["brief_stories"]["Insert"][] = [];

  for (let index = 0; index < topCandidates.length; index += 1) {
    const candidate = topCandidates[index];
    const position = index + 1;
    const cluster = clusterById.get(candidate.cluster_id);
    const rows = membershipsByCluster.get(candidate.cluster_id) ?? [];

    const memberArticles = rows
      .map((row) => articleById.get(row.article_id))
      .filter((article): article is ArticleRow => Boolean(article));

    const sourcesForStory = buildStorySources(memberArticles, sourceNameById);

    storyRows.push({
      brief_id: "",
      cluster_id: candidate.cluster_id,
      position,
      headline: cluster?.label?.trim() || `Cluster ${candidate.cluster_id}`,
      summary: "Summary pending",
      why_it_matters: null,
      confidence: null,
      flags: [],
      sources: sourcesForStory,
    });
  }

  const { data: briefData, error: briefError } = await supabase
    .from("daily_briefs")
    .upsert(
      {
        brief_date: windowDate,
        status: "draft",
        title: null,
        published_at: null,
      },
      { onConflict: "brief_date" },
    )
    .select("id")
    .single();

  if (briefError || !briefData?.id) {
    throw new Error(
      `Failed to create or update draft brief: ${briefError?.message ?? "Unknown error"}`,
    );
  }

  const briefId = briefData.id;
  const upsertStories = storyRows.map((story) => ({
    ...story,
    brief_id: briefId,
  }));

  const { error: storyError } = await supabase
    .from("brief_stories")
    .upsert(upsertStories, { onConflict: "brief_id,position" });

  if (storyError) {
    throw new Error(`Failed to upsert generated brief stories: ${storyError.message}`);
  }

  return {
    windowDate,
    briefId,
    editorLink: `/admin#brief-editor`,
  };
}

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
