"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { formatBriefDate } from "@/lib/format";

type SourceRow = {
  id: string;
  label: string;
  url: string;
};

type StoryForm = {
  id?: string;
  position: number;
  headline: string;
  summary: string;
  whyItMatters: string;
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

type BriefEditorProps = {
  supabase: SupabaseClient<Database>;
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
      headline: string;
      summary: string;
      whyItMatters: string | null;
      sources: Array<{ label: string; url: string }>;
    }>;
  } | null;
  error?: string;
  storyErrors?: StoryErrors;
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
    headline: "",
    summary: "",
    whyItMatters: "",
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
        headline: story.headline,
        summary: story.summary,
        whyItMatters: story.whyItMatters ?? "",
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
    headline: story.headline,
    summary: story.summary,
    whyItMatters: story.whyItMatters || null,
    sources: story.sources.map((source) => ({
      label: source.label,
      url: source.url,
    })),
  }));
}

export default function BriefEditor({ supabase }: BriefEditorProps) {
  const [selectedDate, setSelectedDate] = useState(getYesterdayLocalDateInput);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefForm | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storyErrors, setStoryErrors] = useState<StoryErrors>({});

  const statusLabel = useMemo(() => {
    if (!brief) {
      return "";
    }

    if (brief.status === "published") {
      return `Published${brief.publishedAt ? ` (${new Date(brief.publishedAt).toLocaleString()})` : ""}`;
    }

    return "Draft";
  }, [brief]);

  async function getAccessToken(): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      return null;
    }

    return data.session.access_token;
  }

  async function loadBrief() {
    setIsLoading(true);
    setErrorMessage(null);
    setStoryErrors({});

    const token = await getAccessToken();
    if (!token) {
      setIsLoading(false);
      setErrorMessage("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/brief?date=${selectedDate}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as EditorBriefResponse;
    setIsLoading(false);
    setLoadedDate(selectedDate);

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Failed to load brief.");
      return;
    }

    if (!payload.brief) {
      setBrief(null);
      return;
    }

    setBrief(mapBriefPayload(payload.brief));
  }

  async function runAction(action: "create_draft" | "save_draft" | "publish" | "unpublish") {
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
    };

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
      return;
    }

    if (payload.brief) {
      setBrief(mapBriefPayload(payload.brief));
      setSelectedDate(payload.brief.date);
      setLoadedDate(payload.brief.date);
    }
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

    void runAction("publish");
  }

  return (
    <article className="card">
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
        <button className="button button-muted" type="button" onClick={loadBrief} disabled={isLoading}>
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
            disabled={isSaving}
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

          <div className="editor-story-grid">
            {brief.stories.map((story) => {
              const fieldErrors = storyErrors[story.position];

              return (
                <article className="story-editor-card" key={story.position}>
                  <h3>Story {story.position}</h3>
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

          <div className="editor-actions">
            <button
              className="button button-muted"
              type="button"
              onClick={() => void runAction("save_draft")}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
            <button className="button" type="button" onClick={handlePublish} disabled={isSaving}>
              {isSaving ? "Publishing..." : "Publish"}
            </button>
            <button
              className="button button-muted"
              type="button"
              onClick={() => void runAction("unpublish")}
              disabled={isSaving}
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
