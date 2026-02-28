"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { CandidateStoryAssignment } from "@/app/admin/types";

type CandidateListItem = {
  clusterId: string;
  rank: number;
  label: string;
  score: number;
  volume: number;
  breadth: number;
};

type CandidatesResponse = {
  windowDate: string;
  candidates: CandidateListItem[];
  error?: string;
};

type ClusterDetailResponse = {
  cluster: {
    id: string;
    windowDate: string;
    label: string;
    score: number;
    members: Array<{
      id: string;
      title: string;
      url: string;
      publisher: string;
      publishedAt: string | null;
    }>;
    topSources: Array<{ label: string; url: string }>;
  };
  error?: string;
};

type CandidatesPanelProps = {
  supabase: SupabaseClient<Database>;
  onAssignStory: (assignment: CandidateStoryAssignment) => void;
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

export default function CandidatesPanel({
  supabase,
  onAssignStory,
}: CandidatesPanelProps) {
  const [windowDate, setWindowDate] = useState(getYesterdayDateInput);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClusterDetailResponse["cluster"] | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const title = useMemo(() => {
    if (windowDate === getYesterdayDateInput()) {
      return "Candidates (Yesterday)";
    }

    return `Candidates (${windowDate})`;
  }, [windowDate]);

  async function getAccessToken(): Promise<string | null> {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      return null;
    }

    return data.session.access_token;
  }

  async function loadCandidates() {
    setIsLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setIsLoading(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/candidates?windowDate=${windowDate}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as CandidatesResponse;
    setIsLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "Failed to load candidates.");
      setCandidates([]);
      return;
    }

    setCandidates(payload.candidates ?? []);
  }

  async function openClusterDetail(clusterId: string) {
    setActiveClusterId(clusterId);
    setIsDetailLoading(true);
    setDetail(null);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setIsDetailLoading(false);
      setError("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/cluster/${clusterId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as ClusterDetailResponse;
    setIsDetailLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "Failed to load cluster detail.");
      setActiveClusterId(null);
      return;
    }

    setDetail(payload.cluster);
  }

  function closeClusterDetail() {
    setActiveClusterId(null);
    setDetail(null);
  }

  function assignToStory(position: number) {
    if (!detail) {
      return;
    }

    onAssignStory({
      position,
      clusterId: detail.id,
      headline: detail.label,
      summary: "TODO: write summary",
      sources: detail.topSources,
    });
  }

  useEffect(() => {
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article className="card">
      <h2>{title}</h2>
      <div className="candidates-toolbar">
        <label className="field field-compact">
          <span>Window date</span>
          <input
            className="input"
            type="date"
            value={windowDate}
            onChange={(event) => setWindowDate(event.target.value)}
          />
        </label>
        <button className="button button-muted" type="button" onClick={loadCandidates} disabled={isLoading}>
          {isLoading ? "Loading..." : "Load"}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="candidates-table-wrap">
        <table className="candidates-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Label</th>
              <th>Score</th>
              <th>Volume</th>
              <th>Breadth</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No candidates found for this date.
                </td>
              </tr>
            ) : (
              candidates.map((candidate) => (
                <tr key={candidate.clusterId}>
                  <td>{candidate.rank}</td>
                  <td>{candidate.label}</td>
                  <td>{candidate.score}</td>
                  <td>{candidate.volume}</td>
                  <td>{candidate.breadth}</td>
                  <td>
                    <button
                      className="button button-muted button-small"
                      type="button"
                      onClick={() => void openClusterDetail(candidate.clusterId)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {activeClusterId ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Cluster Detail</h3>
              <button className="button button-muted button-small" type="button" onClick={closeClusterDetail}>
                Close
              </button>
            </div>

            {isDetailLoading ? <p>Loading cluster detail...</p> : null}

            {detail ? (
              <div className="modal-stack">
                <p>
                  <strong>{detail.label}</strong>
                </p>
                <p className="muted">Score {detail.score}</p>

                <div className="assign-controls">
                  <p className="muted">Use as Story #:</p>
                  {[1, 2, 3, 4, 5].map((position) => (
                    <button
                      key={position}
                      className="button button-small"
                      type="button"
                      onClick={() => assignToStory(position)}
                    >
                      {position}
                    </button>
                  ))}
                </div>

                <div className="member-list">
                  {detail.members.map((member) => (
                    <article className="member-item" key={member.id}>
                      <a href={member.url} target="_blank" rel="noopener noreferrer">
                        {member.title}
                      </a>
                      <p className="muted">
                        {member.publisher}
                        {member.publishedAt
                          ? ` - ${new Date(member.publishedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
