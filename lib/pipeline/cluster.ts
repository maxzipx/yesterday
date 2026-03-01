import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const CLUSTER_SIMILARITY_THRESHOLD = 0.32;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
]);

type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  "id" | "title" | "snippet" | "published_at"
>;

type ClusterInsert = Database["public"]["Tables"]["story_clusters"]["Insert"];
type ClusterArticleInsert = Database["public"]["Tables"]["cluster_articles"]["Insert"];

export type ClusterResult = {
  windowDate: string;
  replace: boolean;
  replacedClusters: number;
  articlesConsidered: number;
  clustersCreated: number;
  avgClusterSize: number;
  largestClusters: Array<{ label: string; size: number }>;
};

type TokenVector = Map<string, number>;

type ClusterArticle = {
  id: string;
  title: string;
  snippet: string | null;
  publishedAt: string | null;
  vector: TokenVector;
};

type WorkingCluster = {
  members: ClusterArticle[];
  vectorSum: TokenVector;
};

function formatDateInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYesterdayUtcDateInput(): string {
  const now = new Date();
  const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return formatDateInput(yesterdayUtc);
}

function normalizeText(title: string, snippet: string | null): string {
  return `${title} ${snippet ?? ""}`
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.endsWith("'s")) {
    return token.slice(0, -2);
  }

  if (token.length > 6 && token.endsWith("ing")) {
    return token.slice(0, -3);
  }

  if (token.length > 5 && token.endsWith("ed")) {
    return token.slice(0, -2);
  }

  if (token.length > 5 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function toVector(text: string): TokenVector {
  const vector: TokenVector = new Map();

  const tokens = text
    .split(" ")
    .map((token) => stemToken(token.trim()))
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

  for (const token of tokens) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }

  return vector;
}

function cosineSimilarity(a: TokenVector, b: TokenVector): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (const value of a.values()) {
    aNorm += value * value;
  }

  for (const value of b.values()) {
    bNorm += value * value;
  }

  for (const [token, valueA] of a.entries()) {
    const valueB = b.get(token) ?? 0;
    dot += valueA * valueB;
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return dot / Math.sqrt(aNorm * bNorm);
}

function addToVectorSum(target: TokenVector, source: TokenVector) {
  for (const [token, value] of source.entries()) {
    target.set(token, (target.get(token) ?? 0) + value);
  }
}

function findBestClusterIndex(
  article: ClusterArticle,
  clusters: WorkingCluster[],
): { index: number; similarity: number } {
  let bestIndex = -1;
  let bestSimilarity = 0;

  for (let index = 0; index < clusters.length; index += 1) {
    const similarity = cosineSimilarity(article.vector, clusters[index].vectorSum);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = index;
    }
  }

  return { index: bestIndex, similarity: bestSimilarity };
}

function chooseClusterLabel(cluster: WorkingCluster): string {
  let bestTitle = cluster.members[0]?.title ?? "Untitled cluster";
  let bestScore = -1;

  for (const member of cluster.members) {
    const score = cosineSimilarity(member.vector, cluster.vectorSum);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = member.title;
    }
  }

  return bestTitle;
}

function buildWorkingClusters(articles: ClusterArticle[]): WorkingCluster[] {
  const clusters: WorkingCluster[] = [];

  for (const article of articles) {
    const { index, similarity } = findBestClusterIndex(article, clusters);

    if (index >= 0 && similarity >= CLUSTER_SIMILARITY_THRESHOLD) {
      const cluster = clusters[index];
      cluster.members.push(article);
      addToVectorSum(cluster.vectorSum, article.vector);
      continue;
    }

    const vectorSum: TokenVector = new Map();
    addToVectorSum(vectorSum, article.vector);
    clusters.push({
      members: [article],
      vectorSum,
    });
  }

  return clusters;
}

function toWindowBoundsUtc(windowDate: string): { start: string; end: string } {
  const start = new Date(`${windowDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function clusterArticlesForWindowDate(
  supabase: SupabaseClient<Database>,
  windowDate: string,
  replace = true,
): Promise<ClusterResult> {
  const bounds = toWindowBoundsUtc(windowDate);

  let replacedClusterCount = 0;
  if (replace) {
    const { data: previousClusters, error: previousError } = await supabase
      .from("story_clusters")
      .select("id")
      .eq("window_date", windowDate);

    if (previousError) {
      throw new Error(`Failed to load previous clusters: ${previousError.message}`);
    }

    replacedClusterCount = (previousClusters ?? []).length;

    const { error: deleteError } = await supabase
      .from("story_clusters")
      .delete()
      .eq("window_date", windowDate);

    if (deleteError) {
      throw new Error(`Failed to clear previous clusters: ${deleteError.message}`);
    }
  }

  const { data: articleRows, error: articlesError } = await supabase
    .from("articles")
    .select("id, title, snippet, published_at")
    .gte("published_at", bounds.start)
    .lt("published_at", bounds.end)
    .order("published_at", { ascending: false });

  if (articlesError) {
    throw new Error(`Failed to load articles for clustering: ${articlesError.message}`);
  }

  const articles = ((articleRows ?? []) as ArticleRow[]).map((article) => {
    const normalized = normalizeText(article.title, article.snippet);

    return {
      id: article.id,
      title: article.title,
      snippet: article.snippet,
      publishedAt: article.published_at,
      vector: toVector(normalized),
    };
  });

  if (articles.length === 0) {
    return {
      windowDate,
      replace,
      replacedClusters: replacedClusterCount,
      articlesConsidered: 0,
      clustersCreated: 0,
      avgClusterSize: 0,
      largestClusters: [],
    };
  }

  const workingClusters = buildWorkingClusters(articles);

  const clusterInsertPayload: ClusterInsert[] = workingClusters.map((cluster) => ({
    window_date: windowDate,
    label: chooseClusterLabel(cluster),
    category: null,
    score: cluster.members.length,
  }));

  const { data: insertedClusters, error: insertClustersError } = await supabase
    .from("story_clusters")
    .insert(clusterInsertPayload)
    .select("id, label, score");

  if (insertClustersError) {
    throw new Error(`Failed to insert clusters: ${insertClustersError.message}`);
  }

  const createdClusters = insertedClusters ?? [];
  const membershipRows: ClusterArticleInsert[] = [];

  for (let index = 0; index < workingClusters.length; index += 1) {
    const clusterId = createdClusters[index]?.id;
    if (!clusterId) {
      continue;
    }

    for (const article of workingClusters[index].members) {
      membershipRows.push({
        cluster_id: clusterId,
        article_id: article.id,
      });
    }
  }

  if (membershipRows.length > 0) {
    const { error: membershipError } = await supabase
      .from("cluster_articles")
      .insert(membershipRows);

    if (membershipError) {
      throw new Error(`Failed to insert cluster memberships: ${membershipError.message}`);
    }
  }

  const clusterSizes = workingClusters.map((cluster) => ({
    label: chooseClusterLabel(cluster),
    size: cluster.members.length,
  }));

  clusterSizes.sort((a, b) => b.size - a.size);

  return {
    windowDate,
    replace,
    replacedClusters: replacedClusterCount,
    articlesConsidered: articles.length,
    clustersCreated: workingClusters.length,
    avgClusterSize: Number((articles.length / workingClusters.length).toFixed(2)),
    largestClusters: clusterSizes.slice(0, 5),
  };
}
