import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export function getSupabaseServerClient(): SupabaseClient<Database> {
  const { url, key } = getSupabaseServerEnv();

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
