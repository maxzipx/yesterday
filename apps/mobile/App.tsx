import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "./src/lib/supabase";

type ViewMode = "latest" | "archive" | "detail";

type SourceLink = {
  label: string;
  url: string;
};

type Story = {
  id: string;
  position: number;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  sources: SourceLink[];
};

type BriefWithStories = {
  id: string;
  briefDate: string;
  title: string | null;
  stories: Story[];
};

type ArchiveItem = {
  id: string;
  briefDate: string;
  title: string | null;
};

function formatDateLabel(dateInput: string): string {
  const [year, month, day] = dateInput.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return dateInput;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDate);
}

function parseSources(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const rawLabel = (item as { label?: unknown }).label;
      const rawUrl = (item as { url?: unknown }).url;
      if (typeof rawLabel !== "string" || typeof rawUrl !== "string") {
        return null;
      }

      const label = rawLabel.trim();
      const url = rawUrl.trim();
      if (!label || !url) {
        return null;
      }

      return { label, url };
    })
    .filter((item): item is SourceLink => Boolean(item));
}

async function fetchStoriesForBrief(briefId: string): Promise<Story[]> {
  const { data, error } = await supabase
    .from("brief_stories")
    .select("id, position, headline, summary, why_it_matters, sources")
    .eq("brief_id", briefId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(`Failed loading stories: ${error.message}`);
  }

  return (data ?? []).map((story) => ({
    id: story.id,
    position: story.position,
    headline: story.headline,
    summary: story.summary,
    whyItMatters: story.why_it_matters,
    sources: parseSources(story.sources),
  }));
}

async function fetchLatestPublishedBrief(): Promise<BriefWithStories | null> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed loading latest brief: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const stories = await fetchStoriesForBrief(data.id);
  return {
    id: data.id,
    briefDate: data.brief_date,
    title: data.title,
    stories,
  };
}

async function fetchPublishedBriefByDate(date: string): Promise<BriefWithStories | null> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .eq("brief_date", date)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed loading brief: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const stories = await fetchStoriesForBrief(data.id);
  return {
    id: data.id,
    briefDate: data.brief_date,
    title: data.title,
    stories,
  };
}

async function fetchArchiveList(): Promise<ArchiveItem[]> {
  const { data, error } = await supabase
    .from("daily_briefs")
    .select("id, brief_date, title")
    .eq("status", "published")
    .order("brief_date", { ascending: false })
    .limit(180);

  if (error) {
    throw new Error(`Failed loading archive: ${error.message}`);
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    briefDate: item.brief_date,
    title: item.title,
  }));
}

function StoryCard({ story }: { story: Story }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardKicker}>Story {story.position}</Text>
      <Text style={styles.cardTitle}>{story.headline}</Text>
      <Text style={styles.cardBody}>{story.summary}</Text>
      {story.whyItMatters ? <Text style={styles.cardWhy}>Why it matters: {story.whyItMatters}</Text> : null}
      {story.sources.length > 0 ? (
        <View style={styles.sourcesWrap}>
          <Text style={styles.sourceTitle}>Sources</Text>
          {story.sources.map((source) => (
            <Pressable
              key={`${story.id}-${source.url}`}
              onPress={() => {
                void Linking.openURL(source.url);
              }}
            >
              <Text style={styles.sourceLink}>
                {source.label}: {source.url}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [view, setView] = useState<ViewMode>("latest");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [latestBrief, setLatestBrief] = useState<BriefWithStories | null>(null);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);

  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [detailBrief, setDetailBrief] = useState<BriefWithStories | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const detailDateLabel = useMemo(
    () => (selectedDate ? formatDateLabel(selectedDate) : "No date selected"),
    [selectedDate],
  );

  const loadLatest = useCallback(async () => {
    setLatestLoading(true);
    setLatestError(null);
    try {
      const data = await fetchLatestPublishedBrief();
      setLatestBrief(data);
    } catch (error) {
      setLatestError(error instanceof Error ? error.message : "Unable to load latest brief.");
      setLatestBrief(null);
    } finally {
      setLatestLoading(false);
    }
  }, []);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const data = await fetchArchiveList();
      setArchiveItems(data);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Unable to load archive.");
      setArchiveItems([]);
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (date: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await fetchPublishedBriefByDate(date);
      setDetailBrief(data);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Unable to load brief detail.");
      setDetailBrief(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
    void loadArchive();
  }, [loadArchive, loadLatest]);

  useEffect(() => {
    if (view !== "detail" || !selectedDate) {
      return;
    }
    void loadDetail(selectedDate);
  }, [selectedDate, view, loadDetail]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Yesterday Briefs</Text>
          <Text style={styles.headerSubtitle}>Phase 1 mobile reader</Text>
        </View>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tabButton, view === "latest" ? styles.tabButtonActive : null]} onPress={() => setView("latest")}>
            <Text style={[styles.tabButtonText, view === "latest" ? styles.tabButtonTextActive : null]}>Latest</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, view === "archive" ? styles.tabButtonActive : null]} onPress={() => setView("archive")}>
            <Text style={[styles.tabButtonText, view === "archive" ? styles.tabButtonTextActive : null]}>Archive</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, view === "detail" ? styles.tabButtonActive : null]}
            onPress={() => setView("detail")}
          >
            <Text style={[styles.tabButtonText, view === "detail" ? styles.tabButtonTextActive : null]}>Detail</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {view === "latest" ? (
            <View>
              <Text style={styles.sectionTitle}>Latest Published Brief</Text>
              {latestLoading ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
              {latestError ? <Text style={styles.errorText}>{latestError}</Text> : null}
              {!latestLoading && !latestError && !latestBrief ? (
                <Text style={styles.mutedText}>No published briefs yet.</Text>
              ) : null}
              {latestBrief ? (
                <View style={styles.stack}>
                  <Text style={styles.dateLabel}>{formatDateLabel(latestBrief.briefDate)}</Text>
                  {latestBrief.title ? <Text style={styles.briefTitle}>{latestBrief.title}</Text> : null}
                  {latestBrief.stories.map((story) => (
                    <StoryCard story={story} key={story.id} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {view === "archive" ? (
            <View>
              <Text style={styles.sectionTitle}>Archive</Text>
              {archiveLoading ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
              {archiveError ? <Text style={styles.errorText}>{archiveError}</Text> : null}
              {!archiveLoading && !archiveError && archiveItems.length === 0 ? (
                <Text style={styles.mutedText}>No published briefs found.</Text>
              ) : null}
              <View style={styles.stack}>
                {archiveItems.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.archiveItem}
                    onPress={() => {
                      setSelectedDate(item.briefDate);
                      setView("detail");
                    }}
                  >
                    <Text style={styles.archiveDate}>{formatDateLabel(item.briefDate)}</Text>
                    {item.title ? <Text style={styles.archiveTitle}>{item.title}</Text> : null}
                    <Text style={styles.archiveHint}>Open brief</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {view === "detail" ? (
            <View>
              <Text style={styles.sectionTitle}>Brief Detail</Text>
              <Text style={styles.mutedText}>{detailDateLabel}</Text>
              {!selectedDate ? <Text style={styles.mutedText}>Select a brief from Archive.</Text> : null}
              {detailLoading ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
              {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
              {!detailLoading && selectedDate && !detailError && !detailBrief ? (
                <Text style={styles.mutedText}>No published brief for this date.</Text>
              ) : null}
              {detailBrief ? (
                <View style={styles.stack}>
                  {detailBrief.title ? <Text style={styles.briefTitle}>{detailBrief.title}</Text> : null}
                  {detailBrief.stories.map((story) => (
                    <StoryCard story={story} key={story.id} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: "#475569",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    alignItems: "center",
  },
  tabButtonActive: {
    borderColor: "#1d4ed8",
    backgroundColor: "#e0ebff",
  },
  tabButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#1e3a8a",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
  },
  dateLabel: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "600",
  },
  briefTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  card: {
    borderWidth: 1,
    borderColor: "#dbe3ee",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardKicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#1e3a8a",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#1f2937",
  },
  cardWhy: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  sourcesWrap: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    gap: 5,
  },
  sourceTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1f2937",
  },
  sourceLink: {
    fontSize: 13,
    color: "#1d4ed8",
  },
  archiveItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe3ee",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 4,
  },
  archiveDate: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  archiveTitle: {
    fontSize: 14,
    color: "#334155",
  },
  archiveHint: {
    marginTop: 2,
    fontSize: 13,
    color: "#1d4ed8",
    fontWeight: "600",
  },
  stack: {
    gap: 12,
  },
  mutedText: {
    color: "#475569",
    fontSize: 14,
    marginBottom: 8,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    marginBottom: 8,
  },
});
