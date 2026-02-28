import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin-auth";
import { getSupabaseServerClientForToken } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REORDER = 15;

type ReorderRequestBody = {
  windowDate?: string;
  orderedClusterIds?: string[];
};

type CandidateRow = Pick<
  Database["public"]["Tables"]["cluster_candidates"]["Row"],
  "id" | "window_date" | "cluster_id" | "rank"
>;

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as ReorderRequestBody;
  const windowDate = body.windowDate?.trim() ?? "";
  const orderedClusterIds = body.orderedClusterIds ?? [];

  if (!DATE_PATTERN.test(windowDate)) {
    return NextResponse.json(
      { error: "windowDate must be in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  if (!Array.isArray(orderedClusterIds) || orderedClusterIds.length === 0) {
    return NextResponse.json(
      { error: "orderedClusterIds is required." },
      { status: 400 },
    );
  }

  if (orderedClusterIds.length > MAX_REORDER) {
    return NextResponse.json(
      { error: `Cannot reorder more than ${MAX_REORDER} clusters.` },
      { status: 400 },
    );
  }

  const deduped = new Set(
    orderedClusterIds
      .filter((clusterId): clusterId is string => typeof clusterId === "string")
      .map((clusterId) => clusterId.trim())
      .filter((clusterId) => clusterId.length > 0),
  );

  if (deduped.size !== orderedClusterIds.length) {
    return NextResponse.json(
      { error: "orderedClusterIds must be unique." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClientForToken(auth.accessToken);

  const { data: topRowsData, error: topRowsError } = await supabase
    .from("cluster_candidates")
    .select("id, window_date, cluster_id, rank")
    .eq("window_date", windowDate)
    .order("rank", { ascending: true })
    .limit(MAX_REORDER);

  if (topRowsError) {
    return NextResponse.json(
      { error: `Failed to load candidates: ${topRowsError.message}` },
      { status: 500 },
    );
  }

  const topRows = (topRowsData ?? []) as CandidateRow[];
  if (topRows.length === 0) {
    return NextResponse.json(
      { error: "No candidates found for this windowDate." },
      { status: 404 },
    );
  }

  if (topRows.length !== orderedClusterIds.length) {
    return NextResponse.json(
      { error: `Expected ${topRows.length} cluster ids.` },
      { status: 400 },
    );
  }

  const topClusterSet = new Set(topRows.map((row) => row.cluster_id));
  const requestedSet = new Set(orderedClusterIds);
  if (
    [...requestedSet].some((clusterId) => !topClusterSet.has(clusterId)) ||
    [...topClusterSet].some((clusterId) => !requestedSet.has(clusterId))
  ) {
    return NextResponse.json(
      { error: "orderedClusterIds must match the current top candidates exactly." },
      { status: 400 },
    );
  }

  const candidateIdByCluster = new Map(topRows.map((row) => [row.cluster_id, row.id]));

  for (let index = 0; index < orderedClusterIds.length; index += 1) {
    const clusterId = orderedClusterIds[index];
    const candidateId = candidateIdByCluster.get(clusterId);
    if (!candidateId) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("cluster_candidates")
      .update({ rank: index + 1 })
      .eq("id", candidateId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update rank for cluster ${clusterId}: ${updateError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    windowDate,
    reordered: true,
    orderedClusterIds,
  });
}

