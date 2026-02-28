import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 30;

type CandidateRow = Database["public"]["Tables"]["cluster_candidates"]["Row"];
type ClusterRow = Pick<
  Database["public"]["Tables"]["story_clusters"]["Row"],
  "id" | "label" | "score"
>;
type MembershipRow = Database["public"]["Tables"]["cluster_articles"]["Row"];
type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "publisher" | "source_id"
>;
type SourceRow = Pick<Database["public"]["Tables"]["feed_sources"]["Row"], "id" | "name">;

function formatDateInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayUtcDateInput(): string {
  const now = new Date();
  const yesterdayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  return formatDateInput(yesterdayUtc);
}

function publisherForArticle(
  article: ArticleRow,
  sourceNameById: Map<string, string>,
): string {
  const publisher = article.publisher?.trim();
  if (publisher) {
    return publisher;
  }

  if (article.source_id) {
    const source = sourceNameById.get(article.source_id)?.trim();
    if (source) {
      return source;
    }
  }

  return "Unknown Publisher";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const windowDate =
    request.nextUrl.searchParams.get("windowDate")?.trim() || getYesterdayUtcDateInput();

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  const { data: candidateData, error: candidatesError } = await supabase
    .from("cluster_candidates")
    .select("id, window_date, cluster_id, rank, created_at")
    .eq("window_date", windowDate)
    .order("rank", { ascending: true })
    .limit(LIMIT);

  if (candidatesError) {
    return NextResponse.json(
      { error: `Failed to load candidates: ${candidatesError.message}` },
      { status: 500 },
    );
  }

  const candidates = (candidateData ?? []) as CandidateRow[];
  if (candidates.length === 0) {
    return NextResponse.json({
      windowDate,
      candidates: [],
    });
  }

  const clusterIds = [...new Set(candidates.map((candidate) => candidate.cluster_id))];

  const { data: clusterData, error: clustersError } = await supabase
    .from("story_clusters")
    .select("id, label, score")
    .in("id", clusterIds);

  if (clustersError) {
    return NextResponse.json(
      { error: `Failed to load clusters: ${clustersError.message}` },
      { status: 500 },
    );
  }

  const clusters = (clusterData ?? []) as ClusterRow[];
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));

  const { data: membershipData, error: membershipError } = await supabase
    .from("cluster_articles")
    .select("cluster_id, article_id")
    .in("cluster_id", clusterIds);

  if (membershipError) {
    return NextResponse.json(
      { error: `Failed to load memberships: ${membershipError.message}` },
      { status: 500 },
    );
  }

  const memberships = (membershipData ?? []) as MembershipRow[];
  const articleIds = [...new Set(memberships.map((membership) => membership.article_id))];

  const { data: articleData, error: articlesError } = articleIds.length
    ? await supabase
        .from("articles")
        .select("id, publisher, source_id")
        .in("id", articleIds)
    : { data: [], error: null };

  if (articlesError) {
    return NextResponse.json(
      { error: `Failed to load article metadata: ${articlesError.message}` },
      { status: 500 },
    );
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
    return NextResponse.json(
      { error: `Failed to load source metadata: ${sourceError.message}` },
      { status: 500 },
    );
  }

  const sources = (sourceData ?? []) as SourceRow[];
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

  const membershipsByCluster = new Map<string, MembershipRow[]>();
  for (const membership of memberships) {
    const current = membershipsByCluster.get(membership.cluster_id) ?? [];
    current.push(membership);
    membershipsByCluster.set(membership.cluster_id, current);
  }

  const payload = candidates.map((candidate) => {
    const cluster = clusterById.get(candidate.cluster_id);
    const rows = membershipsByCluster.get(candidate.cluster_id) ?? [];
    const volume = rows.length;

    const publishers = new Set<string>();
    for (const membership of rows) {
      const article = articleById.get(membership.article_id);
      if (!article) {
        continue;
      }

      publishers.add(publisherForArticle(article, sourceNameById));
    }

    return {
      clusterId: candidate.cluster_id,
      rank: candidate.rank,
      label: cluster?.label?.trim() || "Unlabeled cluster",
      score: cluster?.score ?? 0,
      volume,
      breadth: publishers.size,
    };
  });

  return NextResponse.json({
    windowDate,
    candidates: payload,
  });
}
