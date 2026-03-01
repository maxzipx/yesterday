import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { StoryCard } from "../components/story-card";
import { fetchLatestPublishedBrief } from "../lib/briefs";
import { formatDateLabel } from "../lib/date";
import { appStyles } from "../styles";
import type { BriefWithStories } from "../types/briefs";

export function LatestScreen() {
  const [brief, setBrief] = useState<BriefWithStories | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchLatestPublishedBrief();
      setBrief(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load latest brief.");
      setBrief(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={appStyles.screen}
      contentContainerStyle={appStyles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void load()} />}
    >
      <Text style={appStyles.sectionTitle}>Latest Brief</Text>
      {isLoading && !brief ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
      {error ? <Text style={appStyles.errorText}>{error}</Text> : null}
      {!isLoading && !error && !brief ? (
        <Text style={appStyles.mutedText}>No published briefs yet.</Text>
      ) : null}
      {brief ? (
        <View style={appStyles.stack}>
          <Text style={appStyles.dateLabel}>{formatDateLabel(brief.briefDate)}</Text>
          {brief.title ? <Text style={appStyles.briefTitle}>{brief.title}</Text> : null}
          {brief.stories.map((story) => (
            <StoryCard story={story} key={story.id} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
