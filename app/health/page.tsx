import { checkSupabaseHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const health = await checkSupabaseHealth();

  return (
    <section className="page-stack">
      <h1 className="page-heading">Health Check</h1>
      <article className="card">
        <p>
          Status:{" "}
          <strong className={health.ok ? "status-ok" : "status-bad"}>
            {health.ok ? "OK" : "ERROR"}
          </strong>
        </p>
        <p className="muted">Checked at: {new Date(health.checkedAt).toLocaleString()}</p>
        <p className="muted">Latency: {health.latencyMs}ms</p>
        <p>{health.message}</p>
      </article>
    </section>
  );
}
