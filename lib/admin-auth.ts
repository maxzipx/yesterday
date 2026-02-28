import "server-only";
import { NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin";
import {
  getSupabaseServerClient,
  getSupabaseServerClientForToken,
} from "@/lib/supabase/server";

export type AdminRequestAuth =
  | { ok: true; email: string; userId: string; accessToken: string }
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

  if (error || !data.user?.email || !data.user.id) {
    return { ok: false, status: 401, error: error?.message ?? "Invalid session." };
  }

  const email = data.user.email.trim().toLowerCase();
  const userScopedClient = getSupabaseServerClientForToken(token);

  try {
    const admin = await isAdminUser(userScopedClient, data.user.id);
    if (!admin) {
      return { ok: false, status: 403, error: "Not authorized.", email };
    }
  } catch (adminError) {
    return {
      ok: false,
      status: 500,
      error: adminError instanceof Error ? adminError.message : "Admin check failed.",
      email,
    };
  }

  return {
    ok: true,
    email,
    userId: data.user.id,
    accessToken: token,
  };
}
