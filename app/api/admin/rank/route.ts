import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TOP_LIMIT = 30;

type RankRequestBody = {
  windowDate?: string;
};

type ClusterRow = Pick<
  Database["public"]["Tables"]["story_clusters"]["Row"],
  "id" | "label"
>;

type ClusterMembershipRow = Database["public"]["Tables"]["cluster_articles"]["Row"];

type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "publisher" | "published_at" | "source_id" | "title"
>;

type FeedSourceRow = Pick<
  Database["public"]["Tables"]["feed_sources"]["Row"],
  "id" | "name"
>;

type RankedCluster = {
  clusterId: string;
  label: string;
  score: number;
  volume: number;
  breadth: number;
  recency: number;
  topPublishers: Array<{ name: string; count: number }>;
};

export type RankResult = {
  windowDate: string;
  clustersConsidered: number;
  candidatesSaved: number;
  top: Array<{
    rank: number;
    label: string;
    score: number;
    volume: number;
    breadth: number;
    recency: number;
    topPublishers: Array<{ name: string; count: number }>;
  }>;
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

function toWindowBoundsUtc(windowDate: string): {
  start: string;
  end: string;
  recencyStart: string;
} {
  const startDate = new Date(`${windowDate}T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const recencyStartDate = new Date(endDate);
  recencyStartDate.setUTCHours(recencyStartDate.getUTCHours() - 6);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    recencyStart: recencyStartDate.toISOString(),
  };
}

function publisherName(
  article: ArticleRow,
  sourceNameById: Map<string, string>,
): string {
  const articlePublisher = article.publisher?.trim();
  if (articlePublisher) {
    return articlePublisher;
  }

  if (article.source_id) {
    const sourceName = sourceNameById.get(article.source_id)?.trim();
    if (sourceName) {
      return sourceName;
    }
  }

  return "Unknown Publisher";
}

function rankClusters(
  clusters: ClusterRow[],
  memberships: ClusterMembershipRow[],
  articlesById: Map<string, ArticleRow>,
  sourceNameById: Map<string, string>,
  recencyStartIso: string,
  dayEndIso: string,
): RankedCluster[] {
  const membershipsByCluster = new Map<string, ClusterMembershipRow[]>();
  for (const membership of memberships) {
    const current = membershipsByCluster.get(membership.cluster_id) ?? [];
    current.push(membership);
    membershipsByCluster.set(membership.cluster_id, current);
  }

  const recencyStart = new Date(recencyStartIso).getTime();
  const dayEnd = new Date(dayEndIso).getTime();

  const ranked: RankedCluster[] = [];

  for (const cluster of clusters) {
    const members = membershipsByCluster.get(cluster.id) ?? [];
    const articles = members
      .map((member) => articlesById.get(member.article_id))
      .filter((article): article is ArticleRow => Boolean(article));

    const volume = articles.length;
    const publisherCounts = new Map<string, number>();
    let recency = 0;

    for (const article of articles) {
      const publisher = publisherName(article, sourceNameById);
      publisherCounts.set(publisher, (publisherCounts.get(publisher) ?? 0) + 1);

      if (article.published_at) {
        const publishedAt = new Date(article.published_at).getTime();
        if (publishedAt >= recencyStart && publishedAt < dayEnd) {
          recency += 1;
        }
      }
    }

    const breadth = publisherCounts.size;
    const score = Number(((breadth * 3) + volume + (recency * 0.5)).toFixed(4));

    const topPublishers = [...publisherCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const fallbackLabel = articles[0]?.title ?? "Unlabeled cluster";

    ranked.push({
      clusterId: cluster.id,
      label: cluster.label?.trim() || fallbackLabel,
      score,
      volume,
      breadth,
      recency,
      topPublishers,
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.volume - a.volume);
  return ranked;
}

export async function rankClustersForWindowDate(
  supabase: SupabaseClient<Database>,
  windowDate: string,
): Promise<RankResult> {
  const bounds = toWindowBoundsUtc(windowDate);

  const { data: clustersData, error: clustersError } = await supabase
    .from("story_clusters")
    .select("id, label")
    .eq("window_date", windowDate);

  if (clustersError) {
    throw new Error(`Failed to load clusters: ${clustersError.message}`);
  }

  const clusters = (clustersData ?? []) as ClusterRow[];
  if (clusters.length === 0) {
    await supabase.from("cluster_candidates").delete().eq("window_date", windowDate);

    return {
      windowDate,
      clustersConsidered: 0,
      candidatesSaved: 0,
      top: [],
    };
  }

  const clusterIds = clusters.map((cluster) => cluster.id);

  const { data: membershipsData, error: membershipsError } = await supabase
    .from("cluster_articles")
    .select("cluster_id, article_id")
    .in("cluster_id", clusterIds);

  if (membershipsError) {
    throw new Error(`Failed to load cluster memberships: ${membershipsError.message}`);
  }

  const memberships = (membershipsData ?? []) as ClusterMembershipRow[];
  const articleIds = [...new Set(memberships.map((row) => row.article_id))];

  const articlesById = new Map<string, ArticleRow>();
  if (articleIds.length > 0) {
    const { data: articlesData, error: articlesError } = await supabase
      .from("articles")
      .select("id, publisher, published_at, source_id, title")
      .in("id", articleIds)
      .gte("published_at", bounds.start)
      .lt("published_at", bounds.end);

    if (articlesError) {
      throw new Error(`Failed to load cluster articles: ${articlesError.message}`);
    }

    for (const article of (articlesData ?? []) as ArticleRow[]) {
      articlesById.set(article.id, article);
    }
  }

  const sourceIds = [...new Set(
    [...articlesById.values()]
      .map((article) => article.source_id)
      .filter((id): id is string => Boolean(id)),
  )];

  const sourceNameById = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: sourcesData, error: sourcesError } = await supabase
      .from("feed_sources")
      .select("id, name")
      .in("id", sourceIds);

    if (sourcesError) {
      throw new Error(`Failed to load feed sources: ${sourcesError.message}`);
    }

    for (const source of (sourcesData ?? []) as FeedSourceRow[]) {
      sourceNameById.set(source.id, source.name);
    }
  }

  const ranked = rankClusters(
    clusters,
    memberships,
    articlesById,
    sourceNameById,
    bounds.recencyStart,
    bounds.end,
  );

  if (ranked.length > 0) {
    const updates: Database["public"]["Tables"]["story_clusters"]["Insert"][] = ranked.map(
      (cluster) => ({
        id: cluster.clusterId,
        window_date: windowDate,
        label: cluster.label,
        score: cluster.score,
      }),
    );

    const { error: updateError } = await supabase
      .from("story_clusters")
      .upsert(updates, { onConflict: "id" });

    if (updateError) {
      throw new Error(`Failed to update cluster scores: ${updateError.message}`);
    }
  }

  const top = ranked.slice(0, TOP_LIMIT);

  const { error: clearCandidatesError } = await supabase
    .from("cluster_candidates")
    .delete()
    .eq("window_date", windowDate);

  if (clearCandidatesError) {
    throw new Error(`Failed to clear prior candidates: ${clearCandidatesError.message}`);
  }

  if (top.length > 0) {
    const candidateRows: Database["public"]["Tables"]["cluster_candidates"]["Insert"][] =
      top.map((cluster, index) => ({
        window_date: windowDate,
        cluster_id: cluster.clusterId,
        rank: index + 1,
      }));

    const { error: insertCandidatesError } = await supabase
      .from("cluster_candidates")
      .insert(candidateRows);

    if (insertCandidatesError) {
      throw new Error(`Failed to save ranked candidates: ${insertCandidatesError.message}`);
    }
  }

  return {
    windowDate,
    clustersConsidered: ranked.length,
    candidatesSaved: top.length,
    top: top.map((cluster, index) => ({
      rank: index + 1,
      label: cluster.label,
      score: cluster.score,
      volume: cluster.volume,
      breadth: cluster.breadth,
      recency: cluster.recency,
      topPublishers: cluster.topPublishers,
    })),
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as RankRequestBody;
  const windowDate = body.windowDate?.trim() || getYesterdayUtcDateInput();

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  try {
    const result = await rankClustersForWindowDate(supabase, windowDate);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rank failed." },
      { status: 500 },
    );
  }
}
