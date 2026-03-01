import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StoryCard } from "../components/story-card";
import { fetchPublishedBriefByDate } from "../lib/briefs";
import { formatDateLabel } from "../lib/date";
import type { RootStackParamList } from "../navigation/types";
import { appStyles } from "../styles";
import type { BriefWithStories } from "../types/briefs";

type Props = NativeStackScreenProps<RootStackParamList, "BriefDetail">;

export function BriefDetailScreen({ route }: Props) {
  const { briefDate } = route.params;
  const [brief, setBrief] = useState<BriefWithStories | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateLabel = useMemo(() => formatDateLabel(briefDate), [briefDate]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPublishedBriefByDate(briefDate);
      setBrief(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load brief.");
      setBrief(null);
    } finally {
      setIsLoading(false);
    }
  }, [briefDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={appStyles.screen}
      contentContainerStyle={appStyles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void load()} />}
    >
      <Text style={appStyles.sectionTitle}>{dateLabel}</Text>
      {isLoading && !brief ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
      {error ? <Text style={appStyles.errorText}>{error}</Text> : null}
      {!isLoading && !error && !brief ? (
        <Text style={appStyles.mutedText}>No published brief for this date.</Text>
      ) : null}
      {brief ? (
        <View style={appStyles.stack}>
          {brief.title ? <Text style={appStyles.briefTitle}>{brief.title}</Text> : null}
          {brief.stories.map((story) => (
            <StoryCard story={story} key={story.id} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
