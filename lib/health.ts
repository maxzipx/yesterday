import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type HealthStatus = {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  message: string;
};

export async function checkSupabaseHealth(): Promise<HealthStatus> {
  const startedAt = Date.now();

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("daily_briefs")
      .select("id")
      .eq("status", "published")
      .limit(1);

    const latencyMs = Date.now() - startedAt;

    if (error) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs,
        message: `Supabase query failed: ${error.message}`,
      };
    }

    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      latencyMs,
      message: "Supabase reachable and published brief query succeeded.",
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown health check error.",
    };
  }
}
