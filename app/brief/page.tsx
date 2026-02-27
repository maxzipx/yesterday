import Link from "next/link";
import { getLatestPublishedBrief } from "@/lib/briefs";
import { formatBriefDate } from "@/lib/format";

export default async function BriefPage() {
  const brief = await getLatestPublishedBrief();

  if (!brief) {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Latest Brief</h1>
        <div className="card">
          <p>No briefs are published yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <h1 className="page-heading">Latest Brief</h1>
      <article className="card">
        <h2>{brief.title}</h2>
        <p className="muted">Published {formatBriefDate(brief.date)}</p>
        <p>{brief.summary}</p>
        <ul className="highlights">
          {brief.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link href={`/brief/${brief.date}`} className="button-link">
          Open full brief
        </Link>
      </article>
    </section>
  );
}
