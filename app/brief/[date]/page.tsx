export const revalidate = 3600;

import Link from "next/link";
import { getPublishedBriefByDate } from "@/lib/briefs";
import { formatBriefDate } from "@/lib/format";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BriefDetailPageProps = {
  params: Promise<{ date: string }>;
};

export default async function BriefDetailPage({ params }: BriefDetailPageProps) {
  const { date } = await params;

  if (!DATE_PATTERN.test(date)) {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Brief</h1>
        <article className="card">
          <p>No brief published for this date.</p>
          <Link href="/archive" className="button-link">
            Back to archive
          </Link>
        </article>
      </section>
    );
  }

  const brief = await getPublishedBriefByDate(date);

  if (!brief) {
    return (
      <section className="page-stack">
        <h1 className="page-heading">Brief for {date}</h1>
        <article className="card">
          <p>No brief published for this date.</p>
          <Link href="/archive" className="button-link">
            Back to archive
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <h1 className="page-heading">Brief for {formatBriefDate(brief.date)}</h1>
      <article className="card">
        <p className="muted">Published {formatBriefDate(brief.date)}</p>
        {brief.title ? <h2>{brief.title}</h2> : null}
        <div className="story-list">
          {brief.stories.map((story) => (
            <article className="story-card" key={story.id}>
              <p className="muted">Story {story.position}</p>
              <h3>{story.headline}</h3>
              <p>{story.summary}</p>
              {story.sources.length > 0 ? (
                <ul className="inline-list">
                  {story.sources.map((source) => (
                    <li key={`${story.id}-${source.url}`}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.label}
                      </a>
                      <span className="source-url"> ({source.url})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
        <Link href="/archive" className="button-link">
          Back to archive
        </Link>
      </article>
    </section>
  );
}

