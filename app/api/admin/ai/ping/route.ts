import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { ollamaChat } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rate = checkRateLimit(`ai:ping:${auth.userId}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Too many AI ping requests. Try again in ${rate.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  try {
    const result = await ollamaChat({
      messages: [{ role: "user", content: "Respond with: OK" }],
      temperature: 0,
      timeoutMs: 60_000,
    });

    console.info("[admin-ai] ping", {
      userId: auth.userId,
      metrics: result.metrics,
    });

    return NextResponse.json({
      ok: true,
      content: result.content,
      metrics: result.metrics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ollama ping failed.",
      },
      { status: 500 },
    );
  }
}
