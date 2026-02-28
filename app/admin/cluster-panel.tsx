"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type ClusterResponse = {
  windowDate: string;
  replace: boolean;
  replacedClusters: number;
  articlesConsidered: number;
  clustersCreated: number;
  avgClusterSize: number;
  largestClusters: Array<{ label: string; size: number }>;
  error?: string;
};

type ClusterPanelProps = {
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

export default function ClusterPanel({ supabase }: ClusterPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClusterResponse | null>(null);

  async function runClustering() {
    setIsRunning(true);
    setError(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsRunning(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/cluster", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        windowDate: getYesterdayDateInput(),
        replace: true,
      }),
    });

    const payload = (await response.json()) as ClusterResponse;
    setIsRunning(false);

    if (!response.ok) {
      setResult(null);
      setError(payload.error ?? "Clustering failed.");
      return;
    }

    setResult(payload);
  }

  return (
    <article className="card">
      <h2>Article Clustering</h2>
      <p className="muted">Groups yesterday&apos;s ingested articles into story clusters.</p>
      <button className="button" type="button" onClick={runClustering} disabled={isRunning}>
        {isRunning ? "Clustering..." : "Cluster Yesterday's Articles"}
      </button>

      {error ? <p className="error-text">{error}</p> : null}

      {result ? (
        <div className="cluster-summary">
          <p>
            <strong>Window date:</strong> {result.windowDate}
          </p>
          <p>
            <strong>Articles considered:</strong> {result.articlesConsidered}
          </p>
          <p>
            <strong>Clusters created:</strong> {result.clustersCreated}
          </p>
          <p>
            <strong>Average cluster size:</strong> {result.avgClusterSize}
          </p>
          <p>
            <strong>Replaced previous clusters:</strong> {result.replacedClusters}
          </p>
          <div className="cluster-largest">
            <p>
              <strong>Largest clusters:</strong>
            </p>
            {result.largestClusters.length > 0 ? (
              <ul className="inline-list">
                {result.largestClusters.map((cluster) => (
                  <li key={`${cluster.label}-${cluster.size}`}>
                    {cluster.label} ({cluster.size})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No clusters generated.</p>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
