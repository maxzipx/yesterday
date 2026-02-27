export const dynamic = "force-dynamic";

import Link from "next/link";
import { getPublishedBriefs } from "@/lib/briefs";
import { formatBriefDate } from "@/lib/format";

export default async function ArchivePage() {
  const briefs = await getPublishedBriefs();

  return (
    <section className="page-stack">
      <h1 className="page-heading">Brief Archive</h1>
      {briefs.length === 0 ? (
        <article className="card">
          <p>No published briefs yet.</p>
        </article>
      ) : null}
      {briefs.map((brief) => (
        <article className="card" key={brief.date}>
          <p className="muted">{formatBriefDate(brief.date)}</p>
          <h2>{brief.title ?? "Untitled brief"}</h2>
          <Link href={`/brief/${brief.date}`} className="button-link">
            View brief
          </Link>
        </article>
      ))}
    </section>
  );
}

