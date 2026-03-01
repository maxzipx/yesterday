import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Story } from "../types/briefs";

export function StoryCard({ story }: { story: Story }) {
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

const styles = StyleSheet.create({
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
});
