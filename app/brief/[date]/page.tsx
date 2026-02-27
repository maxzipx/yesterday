import Link from "next/link";
import { notFound } from "next/navigation";
import { getBriefByDate } from "@/lib/briefs";
import { formatBriefDate } from "@/lib/format";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BriefDetailPageProps = {
  params: Promise<{ date: string }>;
};

export default async function BriefDetailPage({ params }: BriefDetailPageProps) {
  const { date } = await params;

  if (!DATE_PATTERN.test(date)) {
    notFound();
  }

  const brief = await getBriefByDate(date);

  if (!brief) {
    notFound();
  }

  return (
    <section className="page-stack">
      <h1 className="page-heading">Brief for {formatBriefDate(brief.date)}</h1>
      <article className="card">
        <h2>{brief.title}</h2>
        <p className="muted">Published {brief.date}</p>
        <p>{brief.summary}</p>
        {brief.stories.length > 0 ? (
          <div className="story-list">
            {brief.stories.map((story) => (
              <article className="story-card" key={`${story.position}-${story.headline}`}>
                <p className="muted">Story {story.position}</p>
                <h3>{story.headline}</h3>
                <p>{story.summary}</p>
                {story.whyItMatters ? (
                  <p className="story-meta">
                    <strong>Why it matters:</strong> {story.whyItMatters}
                  </p>
                ) : null}
                {story.sources.length > 0 ? (
                  <ul className="inline-list">
                    {story.sources.map((source) => (
                      <li key={`${story.position}-${source.url}`}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <ul className="highlights">
            {brief.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        <Link href="/archive" className="button-link">
          Back to archive
        </Link>
      </article>
    </section>
  );
}
