"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type GenerateDraftResponse = {
  windowDate: string;
  briefId: string;
  editorLink: string;
  error?: string;
};

type GenerateDraftPanelProps = {
  supabase: SupabaseClient<Database>;
  onGenerated: (date: string) => void;
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

export default function GenerateDraftPanel({
  supabase,
  onGenerated,
}: GenerateDraftPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateDraftResponse | null>(null);

  async function runGeneration() {
    setIsRunning(true);
    setError(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsRunning(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/generate-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        windowDate: getYesterdayDateInput(),
      }),
    });

    const payload = (await response.json()) as GenerateDraftResponse;
    setIsRunning(false);

    if (!response.ok) {
      setResult(null);
      setError(payload.error ?? "Generate draft failed.");
      return;
    }

    setResult(payload);
    onGenerated(payload.windowDate);

    if (typeof window !== "undefined") {
      window.location.hash = "brief-editor";
    }
  }

  return (
    <article className="card">
      <h2>Draft Generator</h2>
      <p className="muted">Create or overwrite yesterday&apos;s draft using top 5 candidates.</p>
      <button className="button" type="button" onClick={runGeneration} disabled={isRunning}>
        {isRunning ? "Generating..." : "Generate Draft From Top 5"}
      </button>

      {error ? <p className="error-text">{error}</p> : null}

      {result ? (
        <div className="generate-summary">
          <p>
            <strong>Window date:</strong> {result.windowDate}
          </p>
          <p>
            <strong>Brief ID:</strong> {result.briefId}
          </p>
          <p className="muted">Draft generated. Editor is ready below.</p>
        </div>
      ) : null}
    </article>
  );
}
