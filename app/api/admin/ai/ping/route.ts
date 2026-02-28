import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { ollamaChat } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await ollamaChat({
      messages: [{ role: "user", content: "Respond with: OK" }],
      temperature: 0,
      timeoutMs: 60_000,
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
