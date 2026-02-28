import Parser from "rss-parser";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEED_TIMEOUT_MS = 12000;

type FeedSourceRow = Database["public"]["Tables"]["feed_sources"]["Row"];
type ArticleInsert = Database["public"]["Tables"]["articles"]["Insert"];
type FeedLike = {
  title?: string;
  items?: ParsedItem[];
};

type ParsedItem = {
  title?: string;
  link?: string;
  url?: string;
  guid?: string;
  id?: string;
  isoDate?: string;
  pubDate?: string;
  published?: string;
  description?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  source?: { title?: string } | string;
  [key: string]: unknown;
};

type IngestRequestBody = {
  windowDate?: string;
};

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayDateInput(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDateInput(yesterday);
}

function normalizeUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function toIsoDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function toSnippet(item: ParsedItem): string | null {
  const candidate =
    item.contentSnippet ??
    item.summary ??
    item.description ??
    item.content;

  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 1200) : null;
}

function getPublisher(item: ParsedItem, feedName: string): string | null {
  if (typeof item.source === "string" && item.source.trim().length > 0) {
    return item.source.trim();
  }

  if (
    typeof item.source === "object" &&
    item.source !== null &&
    typeof item.source.title === "string" &&
    item.source.title.trim().length > 0
  ) {
    return item.source.title.trim();
  }

  return feedName.trim() || null;
}

async function fetchFeedXml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "yesterday-rss-ingest/1.0 (+https://github.com/maxzipx/yesterday)",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as IngestRequestBody;
  const windowDate = body.windowDate?.trim() || getYesterdayDateInput();

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  const { data: feedSources, error: feedError } = await supabase
    .from("feed_sources")
    .select("id, name, url, is_enabled, created_at")
    .eq("is_enabled", true)
    .order("created_at", { ascending: true });

  if (feedError) {
    return NextResponse.json(
      { error: `Failed to load feed sources: ${feedError.message}` },
      { status: 500 },
    );
  }

  const enabledFeeds = (feedSources ?? []) as FeedSourceRow[];
  const parser = new Parser<FeedLike, ParsedItem>();

  let itemsFetched = 0;
  let insertedCount = 0;
  let duplicatesSkipped = 0;
  let invalidItemsSkipped = 0;
  let feedsFailed = 0;
  const feedFailures: Array<{ feed: string; error: string }> = [];

  for (const feed of enabledFeeds) {
    try {
      const xml = await fetchFeedXml(feed.url);
      const parsed = await parser.parseString(xml);
      const parsedItems = parsed.items ?? [];
      itemsFetched += parsedItems.length;

      const candidateRows: ArticleInsert[] = [];

      for (const item of parsedItems) {
        const normalizedUrl = normalizeUrl(item.link ?? item.url ?? item.guid ?? item.id);
        const title = typeof item.title === "string" ? item.title.trim() : "";

        if (!normalizedUrl || !title) {
          invalidItemsSkipped += 1;
          continue;
        }

        const publishedAt =
          toIsoDate(item.isoDate) ??
          toIsoDate(item.pubDate) ??
          toIsoDate(item.published);

        candidateRows.push({
          source_id: feed.id,
          url: normalizedUrl,
          title,
          publisher: getPublisher(item, parsed.title ?? feed.name),
          published_at: publishedAt,
          snippet: toSnippet(item),
          raw: {
            windowDate,
            feed: {
              id: feed.id,
              name: feed.name,
              url: feed.url,
            },
            item,
          } as Json,
          fetched_at: new Date().toISOString(),
        });
      }

      const uniqueByUrl = new Map<string, ArticleInsert>();
      for (const row of candidateRows) {
        uniqueByUrl.set(row.url, row);
      }

      const uniqueRows = [...uniqueByUrl.values()];
      duplicatesSkipped += candidateRows.length - uniqueRows.length;

      if (uniqueRows.length === 0) {
        continue;
      }

      const urls = uniqueRows.map((row) => row.url);
      const { data: existingRows, error: existingError } = await supabase
        .from("articles")
        .select("url")
        .in("url", urls);

      if (existingError) {
        throw new Error(`Failed to check duplicates: ${existingError.message}`);
      }

      const existingCount = (existingRows ?? []).length;
      duplicatesSkipped += existingCount;
      insertedCount += uniqueRows.length - existingCount;

      const { error: upsertError } = await supabase
        .from("articles")
        .upsert(uniqueRows, { onConflict: "url" });

      if (upsertError) {
        throw new Error(`Failed to upsert articles: ${upsertError.message}`);
      }
    } catch (error) {
      feedsFailed += 1;
      feedFailures.push({
        feed: feed.name,
        error: error instanceof Error ? error.message : "Unknown feed failure",
      });
    }
  }

  return NextResponse.json({
    windowDate,
    feedsProcessed: enabledFeeds.length,
    feedsFailed,
    itemsFetched,
    newArticlesInserted: insertedCount,
    duplicatesSkipped,
    invalidItemsSkipped,
    failures: feedFailures,
  });
}
