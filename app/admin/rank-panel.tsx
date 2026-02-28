"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type RankResponse = {
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
  error?: string;
};

type RankPanelProps = {
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

export default function RankPanel({ supabase }: RankPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankResponse | null>(null);

  async function runRanking() {
    setIsRunning(true);
    setError(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsRunning(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/rank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        windowDate: getYesterdayDateInput(),
      }),
    });

    const payload = (await response.json()) as RankResponse;
    setIsRunning(false);

    if (!response.ok) {
      setResult(null);
      setError(payload.error ?? "Ranking failed.");
      return;
    }

    setResult(payload);
  }

  return (
    <article className="card">
      <h2>Cluster Ranking</h2>
      <p className="muted">Scores clusters and snapshots top 30 candidates.</p>
      <button className="button" type="button" onClick={runRanking} disabled={isRunning}>
        {isRunning ? "Ranking..." : "Rank Clusters"}
      </button>

      {error ? <p className="error-text">{error}</p> : null}

      {result ? (
        <div className="rank-summary">
          <p>
            <strong>Window date:</strong> {result.windowDate}
          </p>
          <p>
            <strong>Clusters considered:</strong> {result.clustersConsidered}
          </p>
          <p>
            <strong>Top candidates saved:</strong> {result.candidatesSaved}
          </p>

          {result.top.length > 0 ? (
            <div className="rank-list">
              {result.top.map((cluster) => (
                <article className="rank-item" key={`${cluster.rank}-${cluster.label}`}>
                  <p>
                    <strong>#{cluster.rank}</strong> {cluster.label}
                  </p>
                  <p className="muted">
                    Score {cluster.score} - Volume {cluster.volume} - Breadth {cluster.breadth}
                    {" - "}Recency {cluster.recency}
                  </p>
                  <p className="muted">
                    Top publishers:{" "}
                    {cluster.topPublishers.length > 0
                      ? cluster.topPublishers
                          .map((publisher) => `${publisher.name} (${publisher.count})`)
                          .join(", ")
                      : "None"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No clusters available to rank.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
