import Link from "next/link";
import { getPublishedBriefs } from "@/lib/briefs";
import { formatBriefDate } from "@/lib/format";

export default function ArchivePage() {
  const briefs = getPublishedBriefs();

  return (
    <section className="page-stack">
      <h1 className="page-heading">Brief Archive</h1>
      {briefs.map((brief) => (
        <article className="card" key={brief.date}>
          <h2>{brief.title}</h2>
          <p className="muted">{formatBriefDate(brief.date)}</p>
          <p>{brief.summary}</p>
          <Link href={`/brief/${brief.date}`} className="button-link">
            View brief
          </Link>
        </article>
      ))}
    </section>
  );
}
