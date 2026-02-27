import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    if (auth.status === 403) {
      return NextResponse.json({
        authenticated: true,
        authorized: false,
        email: auth.email ?? null,
      });
    }

    return NextResponse.json({
      authenticated: false,
      authorized: false,
      email: null,
      error: auth.error,
    });
  }

  return NextResponse.json({
    authenticated: true,
    authorized: true,
    email: auth.email,
  });
}
