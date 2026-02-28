import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClusterRow = Pick<
  Database["public"]["Tables"]["story_clusters"]["Row"],
  "id" | "window_date" | "label" | "score"
>;

type MembershipRow = Database["public"]["Tables"]["cluster_articles"]["Row"];

type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "title" | "url" | "publisher" | "published_at" | "source_id"
>;

type SourceRow = Pick<Database["public"]["Tables"]["feed_sources"]["Row"], "id" | "name">;

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clusterId: string }> },
) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { clusterId } = await context.params;
  if (!clusterId) {
    return NextResponse.json({ error: "clusterId is required." }, { status: 400 });
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  const { data: clusterData, error: clusterError } = await supabase
    .from("story_clusters")
    .select("id, window_date, label, score")
    .eq("id", clusterId)
    .maybeSingle();

  if (clusterError) {
    return NextResponse.json(
      { error: `Failed to load cluster: ${clusterError.message}` },
      { status: 500 },
    );
  }

  const cluster = (clusterData as ClusterRow | null) ?? null;
  if (!cluster) {
    return NextResponse.json({ error: "Cluster not found." }, { status: 404 });
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("cluster_articles")
    .select("cluster_id, article_id")
    .eq("cluster_id", cluster.id);

  if (membershipError) {
    return NextResponse.json(
      { error: `Failed to load cluster memberships: ${membershipError.message}` },
      { status: 500 },
    );
  }

  const memberships = (membershipData ?? []) as MembershipRow[];
  const articleIds = [...new Set(memberships.map((membership) => membership.article_id))];

  const { data: articleData, error: articleError } = articleIds.length
    ? await supabase
        .from("articles")
        .select("id, title, url, publisher, published_at, source_id")
        .in("id", articleIds)
    : { data: [], error: null };

  if (articleError) {
    return NextResponse.json(
      { error: `Failed to load cluster articles: ${articleError.message}` },
      { status: 500 },
    );
  }

  const articles = (articleData ?? []) as ArticleRow[];
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
      { error: `Failed to load feed sources: ${sourceError.message}` },
      { status: 500 },
    );
  }

  const sources = (sourceData ?? []) as SourceRow[];
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

  const members = articles
    .map((article) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      publisher: publisherForArticle(article, sourceNameById),
      publishedAt: article.published_at,
    }))
    .sort((a, b) => {
      if (!a.publishedAt && !b.publishedAt) {
        return 0;
      }

      if (!a.publishedAt) {
        return 1;
      }

      if (!b.publishedAt) {
        return -1;
      }

      return b.publishedAt.localeCompare(a.publishedAt);
    });

  const publisherUrlMap = new Map<string, { count: number; url: string }>();
  for (const member of members) {
    const current = publisherUrlMap.get(member.publisher);

    if (!current) {
      publisherUrlMap.set(member.publisher, {
        count: 1,
        url: member.url,
      });
      continue;
    }

    publisherUrlMap.set(member.publisher, {
      count: current.count + 1,
      url: current.url,
    });
  }

  const topSources = [...publisherUrlMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([publisher, data]) => ({
      label: publisher,
      url: data.url,
    }));

  return NextResponse.json({
    cluster: {
      id: cluster.id,
      windowDate: cluster.window_date,
      label: cluster.label?.trim() || "Unlabeled cluster",
      score: cluster.score,
      members,
      topSources,
    },
  });
}
