import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-stack">
      <h1 className="page-heading">Page not found</h1>
      <article className="card">
        <p>The page you requested does not exist.</p>
        <Link href="/brief" className="button-link">
          Back to latest brief
        </Link>
      </article>
    </section>
  );
}
