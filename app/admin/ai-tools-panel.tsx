"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type PingResponse = {
  ok: boolean;
  content?: string;
  metrics?: {
    totalDuration?: number;
    loadDuration?: number;
    promptEvalCount?: number;
    promptEvalDuration?: number;
    evalCount?: number;
    evalDuration?: number;
  };
  error?: string;
};

type AiToolsPanelProps = {
  supabase: SupabaseClient<Database>;
};

function formatDurationNs(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  return `${(value / 1_000_000_000).toFixed(2)}s`;
}

export default function AiToolsPanel({ supabase }: AiToolsPanelProps) {
  const [isPinging, setIsPinging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PingResponse | null>(null);

  async function pingOllama() {
    setIsPinging(true);
    setError(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsPinging(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/ai/ping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({}),
    });

    const payload = (await response.json()) as PingResponse;
    setIsPinging(false);

    if (!response.ok || !payload.ok) {
      setResult(null);
      setError(payload.error ?? "Ollama ping failed.");
      return;
    }

    setResult(payload);
  }

  return (
    <article className="card">
      <h2>AI Diagnostics</h2>
      <p className="muted">
        Verify server-side Ollama connectivity before running AI draft generation.
      </p>
      <button className="button button-muted" type="button" onClick={pingOllama} disabled={isPinging}>
        {isPinging ? "Pinging Ollama..." : "Ping Ollama"}
      </button>

      {error ? <p className="error-text">{error}</p> : null}

      {result ? (
        <div className="generate-summary">
          <p>
            <strong>Response:</strong> {result.content}
          </p>
          <p className="muted">
            Total duration: {formatDurationNs(result.metrics?.totalDuration)} | Eval tokens:{" "}
            {result.metrics?.evalCount ?? "n/a"}
          </p>
        </div>
      ) : null}
    </article>
  );
}

