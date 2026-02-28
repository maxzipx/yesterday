"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { formatBriefDate } from "@/lib/format";
import type {
  BriefLoadDateEvent,
  CandidateStoryAssignmentEvent,
} from "@/app/admin/types";

type SourceRow = {
  id: string;
  label: string;
  url: string;
};

type StoryForm = {
  id?: string;
  position: number;
  clusterId: string | null;
  headline: string;
  summary: string;
  whyItMatters: string;
  confidence: number | null;
  flags: string[];
  sources: SourceRow[];
};

type BriefForm = {
  id: string;
  date: string;
  status: "draft" | "published";
  title: string;
  publishedAt: string | null;
  stories: StoryForm[];
};

type StoryErrors = Record<number, { headline?: string; summary?: string }>;
type AiRunState = "pending" | "running" | "done" | "failed";
type AiRunStatus = { state: AiRunState; message: string };

type BriefEditorProps = {
  supabase: SupabaseClient<Database>;
  assignmentEvent?: CandidateStoryAssignmentEvent | null;
  loadDateEvent?: BriefLoadDateEvent | null;
};

type EditorBriefResponse = {
  brief: {
    id: string;
    date: string;
    status: "draft" | "published";
    title: string | null;
    publishedAt: string | null;
    stories: Array<{
      id: string;
      position: number;
      clusterId: string | null;
      headline: string;
      summary: string;
      whyItMatters: string | null;
      confidence: number | null;
      flags: string[];
      sources: Array<{ label: string; url: string }>;
    }>;
  } | null;
  error?: string;
  storyErrors?: StoryErrors;
  publishWarningRequired?: boolean;
  warningStories?: Array<{ position: number; reasons: string[] }>;
};

type DraftedStoryResponse = {
  story: {
    id: string;
    briefId: string;
    position: number;
    clusterId: string | null;
    headline: string;
    summary: string;
    whyItMatters: string | null;
    confidence: number | null;
    flags: string[];
  };
  error?: string;
};

const POSITIONS = [1, 2, 3, 4, 5] as const;

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayLocalDateInput(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDateInput(yesterday);
}

function createEmptyStory(position: number): StoryForm {
  return {
    position,
    clusterId: null,
    headline: "",
    summary: "",
    whyItMatters: "",
    confidence: null,
    flags: [],
    sources: [],
  };
}

function normalizeStorySet(stories: StoryForm[]): StoryForm[] {
  const byPosition = new Map(stories.map((story) => [story.position, story]));
  return POSITIONS.map((position) => byPosition.get(position) ?? createEmptyStory(position));
}

function mapBriefPayload(payload: NonNullable<EditorBriefResponse["brief"]>): BriefForm {
  return {
    id: payload.id,
    date: payload.date,
    status: payload.status,
    title: payload.title ?? "",
    publishedAt: payload.publishedAt,
    stories: normalizeStorySet(
      payload.stories.map((story) => ({
        id: story.id,
        position: story.position,
        clusterId: story.clusterId,
        headline: story.headline,
        summary: story.summary,
        whyItMatters: story.whyItMatters ?? "",
        confidence: story.confidence,
        flags: story.flags ?? [],
        sources: story.sources.map((source) => ({
          id: makeId(),
          label: source.label,
          url: source.url,
        })),
      })),
    ),
  };
}

function validatePublish(brief: BriefForm): StoryErrors {
  const errors: StoryErrors = {};

  for (const story of brief.stories) {
    const storyErrors: { headline?: string; summary?: string } = {};
    if (!story.headline.trim()) {
      storyErrors.headline = "Headline is required.";
    }

    if (!story.summary.trim()) {
      storyErrors.summary = "Summary is required.";
    }

    if (storyErrors.headline || storyErrors.summary) {
      errors[story.position] = storyErrors;
    }
  }

  return errors;
}

function toRequestStories(stories: StoryForm[]) {
  return normalizeStorySet(stories).map((story) => ({
    position: story.position,
    clusterId: story.clusterId,
    headline: story.headline,
    summary: story.summary,
    whyItMatters: story.whyItMatters || null,
    confidence: story.confidence,
    flags: story.flags,
    sources: story.sources.map((source) => ({
      label: source.label,
      url: source.url,
    })),
  }));
}

function confidenceLabel(value: number | null): string {
  if (typeof value !== "number") {
    return "Unscored";
  }

  return `Confidence ${value.toFixed(2)}`;
}

function confidenceClassName(value: number | null): string {
  if (typeof value !== "number") {
    return "confidence-badge confidence-unknown";
  }

  if (value >= 0.75) {
    return "confidence-badge confidence-good";
  }

  if (value >= 0.5) {
    return "confidence-badge confidence-medium";
  }

  return "confidence-badge confidence-low";
}

function flagLabel(flag: string): string {
  return flag.replace(/_/g, " ");
}

export default function BriefEditor({
  supabase,
  assignmentEvent,
  loadDateEvent,
}: BriefEditorProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefForm | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [generatingPositions, setGeneratingPositions] = useState<Set<number>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storyErrors, setStoryErrors] = useState<StoryErrors>({});
  const [aiRunStatuses, setAiRunStatuses] = useState<Record<number, AiRunStatus>>({});
  const [publishAnyway, setPublishAnyway] = useState(false);
  const [showPublishWarning, setShowPublishWarning] = useState(false);

  const statusLabel = useMemo(() => {
    if (!brief) {
      return "";
    }

    if (brief.status === "published") {
      return `Published${brief.publishedAt ? ` (${new Date(brief.publishedAt).toLocaleString()})` : ""}`;
    }

    return "Draft";
  }, [brief]);

  const publishWarnings = useMemo(() => {
    if (!brief) {
      return [];
    }

    return brief.stories
      .map((story) => {
        const reasons: string[] = [];
        if (typeof story.confidence === "number" && story.confidence < 0.5) {
          reasons.push("low_confidence");
        }

        if (story.flags.includes("limited_sources")) {
          reasons.push("limited_sources");
        }

        if (story.flags.includes("unclear_details")) {
          reasons.push("unclear_details");
        }

        return { position: story.position, reasons };
      })
      .filter((warning) => warning.reasons.length > 0);
  }, [brief]);

  const orderedAiRunStatuses = useMemo(
    () =>
      Object.entries(aiRunStatuses)
        .map(([position, status]) => ({ position: Number(position), ...status }))
        .sort((a, b) => a.position - b.position),
    [aiRunStatuses],
  );

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(getYesterdayLocalDateInput());
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!assignmentEvent) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!brief) {
        setErrorMessage("Load or create a brief draft before assigning a candidate.");
        return;
      }

      const { position, clusterId, headline, summary, sources } = assignmentEvent.payload;

      setBrief((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          stories: current.stories.map((story) => {
            if (story.position !== position) {
              return story;
            }

            return {
              ...story,
              clusterId,
              headline,
              summary,
              confidence: null,
              flags: [],
              sources: sources.map((source) => ({
                id: makeId(),
                label: source.label,
                url: source.url,
              })),
            };
          }),
        };
      });

      setStoryErrors((current) => {
        const next = { ...current };
        delete next[position];
        return next;
      });
      setShowPublishWarning(false);
      setPublishAnyway(false);
      setAiRunStatuses({});
      setErrorMessage(null);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [assignmentEvent, brief]);

  useEffect(() => {
    if (!loadDateEvent) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSelectedDate(loadDateEvent.date);
      void loadBriefForDate(loadDateEvent.date);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDateEvent?.id]);

  async function getAccessToken(): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      return null;
    }

    return data.session.access_token;
  }

  async function loadBriefForDate(date: string) {
    setIsLoading(true);
    setErrorMessage(null);
    setStoryErrors({});

    const token = await getAccessToken();
    if (!token) {
      setIsLoading(false);
      setErrorMessage("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/brief?date=${date}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as EditorBriefResponse;
    setIsLoading(false);
    setLoadedDate(date);

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Failed to load brief.");
      return;
    }

    if (!payload.brief) {
      setBrief(null);
      return;
    }

    setBrief(mapBriefPayload(payload.brief));
    setShowPublishWarning(false);
    setPublishAnyway(false);
    setAiRunStatuses({});
  }

  async function loadBrief() {
    if (!selectedDate) {
      return;
    }
    await loadBriefForDate(selectedDate);
  }

  async function runAction(
    action: "create_draft" | "save_draft" | "publish" | "unpublish",
    options?: { publishAnyway?: boolean },
  ) {
    setIsSaving(true);
    setErrorMessage(null);
    setStoryErrors({});

    const token = await getAccessToken();
    if (!token) {
      setIsSaving(false);
      setErrorMessage("Session expired. Please sign in again.");
      return;
    }

    const body: Record<string, unknown> = {
      action,
      date: brief?.date ?? selectedDate,
      publishAnyway: options?.publishAnyway ?? false,
    };

    if (!body.date) {
      setIsSaving(false);
      setErrorMessage("Select a date first.");
      return;
    }

    if (action !== "create_draft" && brief) {
      body.title = brief.title;
      body.stories = toRequestStories(brief.stories);
    }

    const response = await fetch("/api/admin/brief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as EditorBriefResponse;
    setIsSaving(false);

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Action failed.");
      setStoryErrors(payload.storyErrors ?? {});
      if (payload.publishWarningRequired) {
        setShowPublishWarning(true);
      }
      return;
    }

    if (payload.brief) {
      setBrief(mapBriefPayload(payload.brief));
      setSelectedDate(payload.brief.date);
      setLoadedDate(payload.brief.date);
      if (action === "publish") {
        setShowPublishWarning(false);
        setPublishAnyway(false);
      }
      setAiRunStatuses({});
    }
  }

  function applyDraftedStoryUpdate(storyUpdate: DraftedStoryResponse["story"]) {
    setBrief((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        stories: current.stories.map((story) => {
          if (story.id !== storyUpdate.id) {
            return story;
          }

          return {
            ...story,
            clusterId: storyUpdate.clusterId,
            headline: storyUpdate.headline,
            summary: storyUpdate.summary,
            whyItMatters: storyUpdate.whyItMatters ?? "",
            confidence: storyUpdate.confidence,
            flags: storyUpdate.flags,
          };
        }),
      };
    });
  }

  function updateStory(position: number, changes: Partial<StoryForm>) {
    setBrief((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        stories: current.stories.map((story) =>
          story.position === position ? { ...story, ...changes } : story,
        ),
      };
    });
  }

  function addSource(position: number) {
    setBrief((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        stories: current.stories.map((story) => {
          if (story.position !== position) {
            return story;
          }

          return {
            ...story,
            sources: [...story.sources, { id: makeId(), label: "", url: "" }],
          };
        }),
      };
    });
  }

  function removeSource(position: number, sourceId: string) {
    setBrief((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        stories: current.stories.map((story) => {
          if (story.position !== position) {
            return story;
          }

          return {
            ...story,
            sources: story.sources.filter((source) => source.id !== sourceId),
          };
        }),
      };
    });
  }

  function updateSource(
    position: number,
    sourceId: string,
    field: "label" | "url",
    value: string,
  ) {
    setBrief((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        stories: current.stories.map((story) => {
          if (story.position !== position) {
            return story;
          }

          return {
            ...story,
            sources: story.sources.map((source) =>
              source.id === sourceId ? { ...source, [field]: value } : source,
            ),
          };
        }),
      };
    });
  }

  async function requestAiDraftForStory(
    token: string,
    briefId: string,
    storyId: string,
  ): Promise<DraftedStoryResponse["story"]> {
    const response = await fetch("/api/admin/ai/draft-story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        briefId,
        storyId,
      }),
    });

    const payload = (await response.json()) as DraftedStoryResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "AI draft failed.");
    }

    return payload.story;
  }

  async function generateAiDraftForStory(story: StoryForm) {
    if (!brief || !story.id) {
      return;
    }

    if (!story.clusterId) {
      setErrorMessage(`Story ${story.position} has no cluster assigned.`);
      return;
    }

    const confirmed = window.confirm(
      `Regenerate Story ${story.position}? This will overwrite headline, summary, and why it matters.`,
    );
    if (!confirmed) {
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage("Session expired. Please sign in again.");
      return;
    }

    setGeneratingPositions((current) => {
      const next = new Set(current);
      next.add(story.position);
      return next;
    });
    setAiRunStatuses((current) => ({
      ...current,
      [story.position]: { state: "running", message: "Generating..." },
    }));
    setErrorMessage(null);

    try {
      const drafted = await requestAiDraftForStory(token, brief.id, story.id);
      applyDraftedStoryUpdate(drafted);
      setAiRunStatuses((current) => ({
        ...current,
        [story.position]: { state: "done", message: "Drafted" },
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to draft Story ${story.position}.`;
      setErrorMessage(message);
      setAiRunStatuses((current) => ({
        ...current,
        [story.position]: { state: "failed", message },
      }));
    } finally {
      setGeneratingPositions((current) => {
        const next = new Set(current);
        next.delete(story.position);
        return next;
      });
    }
  }

  async function generateAiDraftsForBrief() {
    if (!brief) {
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage("Session expired. Please sign in again.");
      return;
    }

    setIsGeneratingAi(true);
    setErrorMessage(null);
    const storiesToDraft = brief.stories
      .filter((story) => story.clusterId && story.id)
      .sort((a, b) => a.position - b.position);

    if (storiesToDraft.length === 0) {
      setIsGeneratingAi(false);
      setErrorMessage("No stories with cluster assignments to draft.");
      return;
    }

    setAiRunStatuses(
      storiesToDraft.reduce<Record<number, AiRunStatus>>((acc, story) => {
        acc[story.position] = { state: "pending", message: "Queued" };
        return acc;
      }, {}),
    );

    const failures: Array<{ position: number; message: string }> = [];

    for (const story of storiesToDraft) {
      if (!story.id) {
        continue;
      }

      setGeneratingPositions((current) => {
        const next = new Set(current);
        next.add(story.position);
        return next;
      });
      setAiRunStatuses((current) => ({
        ...current,
        [story.position]: { state: "running", message: "Generating..." },
      }));

      try {
        const drafted = await requestAiDraftForStory(token, brief.id, story.id);
        applyDraftedStoryUpdate(drafted);
        setAiRunStatuses((current) => ({
          ...current,
          [story.position]: { state: "done", message: "Drafted" },
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Failed to draft Story ${story.position}.`;
        failures.push({ position: story.position, message });
        setAiRunStatuses((current) => ({
          ...current,
          [story.position]: { state: "failed", message },
        }));
      } finally {
        setGeneratingPositions((current) => {
          const next = new Set(current);
          next.delete(story.position);
          return next;
        });
      }
    }

    setIsGeneratingAi(false);

    if (failures.length > 0) {
      const details = failures
        .map((failure) => `Story ${failure.position}: ${failure.message}`)
        .join(" | ");
      setErrorMessage(`Some stories were not drafted: ${details}`);
      return;
    }

    setErrorMessage(null);
  }

  function handlePublish() {
    if (!brief) {
      return;
    }

    const errors = validatePublish(brief);
    if (Object.keys(errors).length > 0) {
      setStoryErrors(errors);
      setErrorMessage("Fix required fields before publishing.");
      return;
    }

    if (publishWarnings.length > 0 && !publishAnyway) {
      setShowPublishWarning(true);
      setErrorMessage(
        "Publishing requires confirmation because one or more stories are low confidence or flagged.",
      );
      return;
    }

    void runAction("publish", { publishAnyway });
  }

  return (
    <article className="card" id="brief-editor">
      <h2>Brief Editor</h2>
      <div className="editor-toolbar">
        <label className="field field-compact">
          <span>Date</span>
          <input
            className="input"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <button
          className="button button-muted"
          type="button"
          onClick={loadBrief}
          disabled={isLoading || !selectedDate}
        >
          {isLoading ? "Loading..." : "Load"}
        </button>
      </div>

      {loadedDate && !brief ? (
        <div className="editor-empty">
          <p>No brief exists for {loadedDate}.</p>
          <button
            className="button"
            type="button"
            onClick={() => void runAction("create_draft")}
            disabled={isSaving || isGeneratingAi || !selectedDate}
          >
            Create draft for this date
          </button>
        </div>
      ) : null}

      {brief ? (
        <div className="editor-stack">
          <p className="muted">
            Editing {formatBriefDate(brief.date)} - {statusLabel}
          </p>
          <label className="field">
            <span>Brief title (optional)</span>
            <input
              className="input"
              type="text"
              value={brief.title}
              onChange={(event) =>
                setBrief((current) =>
                  current ? { ...current, title: event.target.value } : current,
                )
              }
              placeholder="Optional title"
            />
          </label>
          <button
            className="button button-muted"
            type="button"
            onClick={() => void generateAiDraftsForBrief()}
            disabled={isGeneratingAi || isSaving}
          >
            {isGeneratingAi ? "Generating AI Drafts..." : "Generate AI Drafts"}
          </button>

          {orderedAiRunStatuses.length > 0 ? (
            <div className="ai-progress-card">
              <p className="muted">AI generation progress</p>
              <ul className="inline-list ai-progress-list">
                {orderedAiRunStatuses.map((status) => (
                  <li key={`ai-run-${status.position}`}>
                    Story {status.position}:{" "}
                    <span className={`ai-progress-state ai-progress-${status.state}`}>
                      {status.state}
                    </span>
                    {" - "}
                    {status.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="editor-story-grid">
            {brief.stories.map((story) => {
              const fieldErrors = storyErrors[story.position];
              const isGeneratingStory = generatingPositions.has(story.position);
              const runStatus = aiRunStatuses[story.position];

              return (
                <article className="story-editor-card" key={story.position}>
                  <div className="story-header-row">
                    <h3>Story {story.position}</h3>
                    <button
                      className="button button-muted button-small"
                      type="button"
                      onClick={() => void generateAiDraftForStory(story)}
                      disabled={
                        isSaving ||
                        isGeneratingAi ||
                        isGeneratingStory ||
                        !story.clusterId ||
                        !story.id
                      }
                    >
                      {isGeneratingStory ? "Regenerating..." : "Regenerate"}
                    </button>
                  </div>
                  <p className="muted">Cluster: {story.clusterId ?? "None assigned"}</p>
                  {runStatus ? (
                    <p className={`ai-progress-state ai-progress-${runStatus.state}`}>
                      {runStatus.state}: {runStatus.message}
                    </p>
                  ) : null}
                  <div className="story-ai-meta">
                    <span className={confidenceClassName(story.confidence)}>
                      {confidenceLabel(story.confidence)}
                    </span>
                    {story.flags.length > 0 ? (
                      <div className="flag-list">
                        {story.flags.map((flag) => (
                          <span className="flag-chip" key={`${story.position}-${flag}`}>
                            {flagLabel(flag)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <label className="field">
                    <span>Headline</span>
                    <input
                      className="input"
                      type="text"
                      value={story.headline}
                      onChange={(event) =>
                        updateStory(story.position, { headline: event.target.value })
                      }
                    />
                    {fieldErrors?.headline ? (
                      <span className="error-text">{fieldErrors.headline}</span>
                    ) : null}
                  </label>

                  <label className="field">
                    <span>Summary (2-4 sentences recommended)</span>
                    <textarea
                      className="textarea"
                      rows={4}
                      value={story.summary}
                      onChange={(event) =>
                        updateStory(story.position, { summary: event.target.value })
                      }
                    />
                    {fieldErrors?.summary ? (
                      <span className="error-text">{fieldErrors.summary}</span>
                    ) : null}
                  </label>

                  <label className="field">
                    <span>Why it matters (optional)</span>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={story.whyItMatters}
                      onChange={(event) =>
                        updateStory(story.position, { whyItMatters: event.target.value })
                      }
                    />
                  </label>

                  <div className="sources-block">
                    <p className="sources-title">Sources</p>
                    {story.sources.length === 0 ? (
                      <p className="muted">No sources added.</p>
                    ) : null}
                    {story.sources.map((source) => (
                      <div className="source-row" key={source.id}>
                        <input
                          className="input"
                          type="text"
                          placeholder="Label"
                          value={source.label}
                          onChange={(event) =>
                            updateSource(story.position, source.id, "label", event.target.value)
                          }
                        />
                        <input
                          className="input"
                          type="url"
                          placeholder="https://example.com"
                          value={source.url}
                          onChange={(event) =>
                            updateSource(story.position, source.id, "url", event.target.value)
                          }
                        />
                        <button
                          className="button button-muted button-small"
                          type="button"
                          onClick={() => removeSource(story.position, source.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      className="button button-muted button-small"
                      type="button"
                      onClick={() => addSource(story.position)}
                    >
                      Add source row
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {showPublishWarning && publishWarnings.length > 0 ? (
            <div className="publish-warning">
              <p className="publish-warning-title">Publish warning</p>
              <p className="muted">
                Some stories have low confidence or warning flags. Confirm to publish anyway.
              </p>
              <ul className="inline-list">
                {publishWarnings.map((warning) => (
                  <li key={`warning-${warning.position}`}>
                    Story {warning.position}:{" "}
                    {warning.reasons.map((reason) => flagLabel(reason)).join(", ")}
                  </li>
                ))}
              </ul>
              <label className="warning-checkbox">
                <input
                  type="checkbox"
                  checked={publishAnyway}
                  onChange={(event) => setPublishAnyway(event.target.checked)}
                />
                <span>Publish anyway</span>
              </label>
            </div>
          ) : null}

          <div className="editor-actions">
            <button
              className="button button-muted"
              type="button"
              onClick={() => void runAction("save_draft")}
              disabled={isSaving || isGeneratingAi}
            >
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
            <button
              className="button"
              type="button"
              onClick={handlePublish}
              disabled={isSaving || isGeneratingAi}
            >
              {isSaving ? "Publishing..." : "Publish"}
            </button>
            <button
              className="button button-muted"
              type="button"
              onClick={() => void runAction("unpublish")}
              disabled={isSaving || isGeneratingAi}
            >
              Unpublish
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </article>
  );
}
