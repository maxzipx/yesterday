import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      authorized: false,
      email: null,
      error: "Missing access token.",
    });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user?.email) {
    return NextResponse.json({
      authenticated: false,
      authorized: false,
      email: null,
      error: error?.message ?? "Invalid session.",
    });
  }

  const email = data.user.email.trim().toLowerCase();
  return NextResponse.json({
    authenticated: true,
    authorized: isAdminEmail(email),
    email,
  });
}
