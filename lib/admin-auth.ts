import "server-only";
import { NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AdminRequestAuth =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string; email?: string };

function getBearerToken(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireAdminFromRequest(
  request: NextRequest,
): Promise<AdminRequestAuth> {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Missing access token." };
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user?.email) {
    return { ok: false, status: 401, error: error?.message ?? "Invalid session." };
  }

  const email = data.user.email.trim().toLowerCase();
  if (!isAdminEmail(email)) {
    return { ok: false, status: 403, error: "Not authorized.", email };
  }

  return { ok: true, email };
}
