import { StyleSheet } from "react-native";

export const appStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
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
  mutedText: {
    color: "#475569",
    fontSize: 14,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
  },
  stack: {
    gap: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe3ee",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1d4ed8",
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  buttonMuted: {
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  buttonMutedText: {
    color: "#334155",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    fontSize: 15,
  },
  label: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
});
