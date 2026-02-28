"use client";

import Link from "next/link";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="page-stack">
      <h1 className="page-heading">Something went wrong</h1>
      <article className="card">
        <p>We hit an unexpected error while loading this page.</p>
        <div className="editor-actions">
          <button type="button" className="button" onClick={reset}>
            Try again
          </button>
          <Link href="/brief" className="button-link">
            Go to latest brief
          </Link>
        </div>
      </article>
    </section>
  );
}
