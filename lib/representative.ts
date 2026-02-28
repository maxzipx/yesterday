import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ClusterMembershipRow = Database["public"]["Tables"]["cluster_articles"]["Row"];

type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "title" | "publisher" | "snippet" | "url" | "published_at" | "source_id"
>;

type SourceRow = Pick<Database["public"]["Tables"]["feed_sources"]["Row"], "id" | "name">;

export type RepresentativeArticle = {
  title: string;
  publisher: string;
  snippet: string | null;
  url: string;
  published_at: string | null;
};

function clampMax(value: number): number {
  if (!Number.isFinite(value)) {
    return 6;
  }

  return Math.min(6, Math.max(3, Math.floor(value)));
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

  return "Unknown Publisher";
}

function sortByRecencyDesc(a: ArticleRow, b: ArticleRow): number {
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
}

export async function getRepresentativeArticles(
  clusterId: string,
  max = 6,
  supabase?: SupabaseClient<Database>,
): Promise<RepresentativeArticle[]> {
  const client = supabase ?? getSupabaseServerClient();
  const limit = clampMax(max);

  const { data: membershipData, error: membershipError } = await client
    .from("cluster_articles")
    .select("cluster_id, article_id")
    .eq("cluster_id", clusterId);

  if (membershipError) {
    throw new Error(`Failed to load cluster memberships: ${membershipError.message}`);
  }

  const memberships = (membershipData ?? []) as ClusterMembershipRow[];
  const articleIds = [...new Set(memberships.map((membership) => membership.article_id))];

  if (articleIds.length === 0) {
    return [];
  }

  const { data: articleData, error: articleError } = await client
    .from("articles")
    .select("id, title, publisher, snippet, url, published_at, source_id")
    .in("id", articleIds);

  if (articleError) {
    throw new Error(`Failed to load cluster articles: ${articleError.message}`);
  }

  const articles = ((articleData ?? []) as ArticleRow[]).sort(sortByRecencyDesc);

  const sourceIds = [...new Set(
    articles
      .map((article) => article.source_id)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  )];

  const sourceNameById = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: sourceData, error: sourceError } = await client
      .from("feed_sources")
      .select("id, name")
      .in("id", sourceIds);

    if (sourceError) {
      throw new Error(`Failed to load feed source names: ${sourceError.message}`);
    }

    for (const source of (sourceData ?? []) as SourceRow[]) {
      sourceNameById.set(source.id, source.name);
    }
  }

  const selected: ArticleRow[] = [];
  const selectedIds = new Set<string>();
  const publisherSet = new Set<string>();

  // Pass 1: maximize publisher diversity while keeping newest stories first.
  for (const article of articles) {
    const publisher = publisherName(article, sourceNameById);
    if (publisherSet.has(publisher)) {
      continue;
    }

    selected.push(article);
    selectedIds.add(article.id);
    publisherSet.add(publisher);

    if (selected.length >= limit) {
      break;
    }
  }

  // Pass 2: fill remaining slots by recency if we still need more context lines.
  if (selected.length < limit) {
    for (const article of articles) {
      if (selectedIds.has(article.id)) {
        continue;
      }

      selected.push(article);
      selectedIds.add(article.id);

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected.map((article) => ({
    title: article.title,
    publisher: publisherName(article, sourceNameById),
    snippet: article.snippet,
    url: article.url,
    published_at: article.published_at,
  }));
}
