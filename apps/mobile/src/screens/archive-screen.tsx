import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchArchiveList } from "../lib/briefs";
import { formatDateLabel } from "../lib/date";
import type { RootStackParamList } from "../navigation/types";
import { appStyles } from "../styles";
import type { ArchiveItem } from "../types/briefs";

type RootNav = NativeStackNavigationProp<RootStackParamList>;

export function ArchiveScreen() {
  const navigation = useNavigation<RootNav>();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchArchiveList();
      setItems(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load archive.");
      setItems([]);
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
      <Text style={appStyles.sectionTitle}>Archive</Text>
      {isLoading && items.length === 0 ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
      {error ? <Text style={appStyles.errorText}>{error}</Text> : null}
      {!isLoading && !error && items.length === 0 ? (
        <Text style={appStyles.mutedText}>No published briefs found.</Text>
      ) : null}
      <View style={appStyles.stack}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={appStyles.card}
            onPress={() => {
              navigation.navigate("BriefDetail", { briefDate: item.briefDate });
            }}
          >
            <Text style={appStyles.dateLabel}>{formatDateLabel(item.briefDate)}</Text>
            {item.title ? <Text style={appStyles.briefTitle}>{item.title}</Text> : null}
            <Text style={appStyles.mutedText}>Open brief</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
