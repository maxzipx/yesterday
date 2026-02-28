"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type IngestResult = {
  windowDate: string;
  feedsProcessed: number;
  feedsFailed: number;
  itemsFetched: number;
  newArticlesInserted: number;
  duplicatesSkipped: number;
  invalidItemsSkipped: number;
  failures: Array<{ feed: string; error: string }>;
};

type RssIngestPanelProps = {
  supabase: SupabaseClient<Database>;
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

export default function RssIngestPanel({ supabase }: RssIngestPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  async function runIngest() {
    setIsRunning(true);
    setError(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsRunning(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch("/api/admin/ingest-rss", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          windowDate: getYesterdayDateInput(),
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as IngestResult & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "RSS ingestion failed.");
        setResult(null);
        return;
      }

      setResult(payload);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        setError(
          "RSS ingestion timed out after 60s. Check feed availability and server logs, then try again.",
        );
      } else {
        setError(requestError instanceof Error ? requestError.message : "RSS ingestion failed.");
      }
      setResult(null);
    } finally {
      clearTimeout(timeout);
      setIsRunning(false);
    }
  }

  return (
    <article className="card">
      <h2>RSS Ingestion</h2>
      <p className="muted">Ingest metadata from enabled feed sources.</p>
      <button className="button" type="button" onClick={runIngest} disabled={isRunning}>
        {isRunning ? "Ingesting..." : "Ingest RSS for Yesterday"}
      </button>

      {error ? <p className="error-text">{error}</p> : null}

      {result ? (
        <div className="ingest-summary">
          <p>
            <strong>Window date:</strong> {result.windowDate}
          </p>
          <p>
            <strong>Feeds processed:</strong> {result.feedsProcessed}
          </p>
          <p>
            <strong>Items fetched:</strong> {result.itemsFetched}
          </p>
          <p>
            <strong>New articles inserted:</strong> {result.newArticlesInserted}
          </p>
          <p>
            <strong>Duplicates skipped:</strong> {result.duplicatesSkipped}
          </p>
          {result.newArticlesInserted === 0 && result.duplicatesSkipped > 0 ? (
            <p className="muted">No new URLs were found in enabled feeds for this run.</p>
          ) : null}
          {result.invalidItemsSkipped > 0 ? (
            <p>
              <strong>Invalid items skipped:</strong> {result.invalidItemsSkipped}
            </p>
          ) : null}
          {result.feedsFailed > 0 ? (
            <div className="ingest-failures">
              <p>
                <strong>Feed failures:</strong> {result.feedsFailed}
              </p>
              <ul className="inline-list">
                {result.failures.map((failure) => (
                  <li key={`${failure.feed}-${failure.error}`}>{`${failure.feed}: ${failure.error}`}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
