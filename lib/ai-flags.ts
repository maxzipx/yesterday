export function normalizeAiFlag(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const aliasMap: Record<string, string> = {
    "reports vary": "reports_vary",
    "report vary": "reports_vary",
    "limited sources": "limited_sources",
    "unclear details": "unclear_details",
    "developing story": "developing_story",
    "low confidence": "low_confidence",
  };

  if (aliasMap[trimmed]) {
    return aliasMap[trimmed];
  }

  const normalized = trimmed
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.length > 0 ? normalized : null;
}

export function normalizeAiFlags(values: string[]): string[] {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = normalizeAiFlag(value);
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return [...deduped];
}

