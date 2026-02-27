import type { Metadata } from "next";
import Link from "next/link";
import { Lora, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const bodyFont = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

const headingFont = Lora({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yesterday Briefs",
  description: "Daily published brief archive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>
        <div className="site-shell">
          <header className="site-header">
            <div className="content-wrap header-inner">
              <Link href="/brief" className="brand">
                Yesterday
              </Link>
              <nav className="site-nav" aria-label="Primary">
                <Link href="/brief">Brief</Link>
                <Link href="/archive">Archive</Link>
                <Link href="/admin">Admin</Link>
              </nav>
            </div>
          </header>
          <main className="site-main content-wrap">{children}</main>
          <footer className="site-footer">
            <div className="content-wrap">
              <p>Yesterday Briefs</p>
              <p className="muted">A simple publishing dashboard placeholder.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
