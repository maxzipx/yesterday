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

  const brief = getBriefByDate(date);

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
        <ul className="highlights">
          {brief.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link href="/archive" className="button-link">
          Back to archive
        </Link>
      </article>
    </section>
  );
}
