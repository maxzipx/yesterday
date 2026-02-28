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

type FullDraftStep = {
  step: "ingest" | "cluster" | "rank" | "generate_draft" | "draft_with_ai";
  ok: boolean;
  message: string;
  durationMs: number;
};

type GenerateFullDraftResponse = {
  briefId?: string;
  briefDate?: string;
  statuses?: FullDraftStep[];
  stories?: Array<{ id: string; position: number }>;
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
  const [isRunningTop5, setIsRunningTop5] = useState(false);
  const [top5Error, setTop5Error] = useState<string | null>(null);
  const [top5Result, setTop5Result] = useState<GenerateDraftResponse | null>(null);
  const [isRunningFull, setIsRunningFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const [fullResult, setFullResult] = useState<GenerateFullDraftResponse | null>(null);

  const stepLabels: Record<FullDraftStep["step"], string> = {
    ingest: "1) Ingest RSS",
    cluster: "2) Cluster articles",
    rank: "3) Rank clusters",
    generate_draft: "4) Generate top-5 draft",
    draft_with_ai: "5) Generate AI story drafts",
  };

  function formatDuration(durationMs: number): string {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  async function runGeneration() {
    setIsRunningTop5(true);
    setTop5Error(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsRunningTop5(false);
      setTop5Error("Session expired. Please sign in again.");
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
    setIsRunningTop5(false);

    if (!response.ok) {
      setTop5Result(null);
      setTop5Error(payload.error ?? "Generate draft failed.");
      return;
    }

    setTop5Result(payload);
    onGenerated(payload.windowDate);

    if (typeof window !== "undefined") {
      window.location.hash = "brief-editor";
    }
  }

  async function runFullGeneration() {
    setIsRunningFull(true);
    setFullError(null);
    setFullResult(null);

    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      setIsRunningFull(false);
      setFullError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch("/api/admin/generate-full-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        windowDate: getYesterdayDateInput(),
      }),
    });

    const payload = (await response.json()) as GenerateFullDraftResponse;
    setIsRunningFull(false);

    if (!response.ok) {
      setFullResult(payload);
      setFullError(payload.error ?? "Generate full draft failed.");
      return;
    }

    setFullResult(payload);
    if (payload.briefDate) {
      onGenerated(payload.briefDate);
    }

    if (typeof window !== "undefined") {
      window.location.hash = "brief-editor";
    }
  }

  return (
    <article className="card">
      <h2>Draft Generator</h2>
      <p className="muted">Create or overwrite yesterday&apos;s draft using ranked candidates.</p>

      <div className="editor-actions">
        <button
          className="button"
          type="button"
          onClick={runFullGeneration}
          disabled={isRunningFull || isRunningTop5}
        >
          {isRunningFull ? "Generating Full Draft..." : "Generate Full Draft"}
        </button>
        <button
          className="button button-muted"
          type="button"
          onClick={runGeneration}
          disabled={isRunningTop5 || isRunningFull}
        >
          {isRunningTop5 ? "Generating..." : "Generate Draft From Top 5"}
        </button>
      </div>

      {top5Error ? <p className="error-text">{top5Error}</p> : null}

      {top5Result ? (
        <div className="generate-summary">
          <p>
            <strong>Window date:</strong> {top5Result.windowDate}
          </p>
          <p>
            <strong>Brief ID:</strong> {top5Result.briefId}
          </p>
          <p className="muted">Draft generated. Editor is ready below.</p>
        </div>
      ) : null}

      {isRunningFull ? (
        <div className="generate-summary">
          <p className="muted">Running full pipeline on server...</p>
          <ul className="inline-list">
            {Object.values(stepLabels).map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {fullError ? <p className="error-text">{fullError}</p> : null}

      {fullResult ? (
        <div className="generate-summary">
          <p>
            <strong>Window date:</strong> {fullResult.briefDate ?? getYesterdayDateInput()}
          </p>
          <p>
            <strong>Brief ID:</strong> {fullResult.briefId ?? "N/A"}
          </p>
          <p className="muted">Pipeline progress:</p>
          <ul className="inline-list">
            {(fullResult.statuses ?? []).map((status) => (
              <li key={`${status.step}-${status.message}`}>
                {stepLabels[status.step]}: {status.ok ? "OK" : "Failed"} ({formatDuration(status.durationMs)}) -{" "}
                {status.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fullResult?.stories?.length ? (
        <p className="muted">{fullResult.stories.length} stories updated with AI drafts.</p>
      ) : null}
    </article>
  );
}
