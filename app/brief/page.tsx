export const revalidate = 3600;

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
        <Link href={`/brief/${brief.date}`} className="button-link">
          Open date permalink
        </Link>
      </article>
    </section>
  );
}

