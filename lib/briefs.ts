export type Brief = {
  date: string;
  title: string;
  summary: string;
  highlights: string[];
};

const publishedBriefs: Brief[] = [
  {
    date: "2026-02-26",
    title: "State Policy Signals and Market Impact",
    summary:
      "A quick review of policy signals, business moves, and notable sentiment shifts from the last 24 hours.",
    highlights: [
      "Regulatory updates pointed to slower near-term approvals in two sectors.",
      "Major retailers reported cautious but stable demand in weekly commentary.",
      "Macro data release schedule suggests a quiet opening to next week.",
    ],
  },
  {
    date: "2026-02-25",
    title: "Earnings Momentum Check",
    summary:
      "Published companies showed mixed guidance while operational cost control remained a common positive theme.",
    highlights: [
      "Guidance revisions were narrow, with fewer large downside surprises.",
      "Operational margin stability improved in software and logistics.",
      "Hiring commentary remained conservative across most management calls.",
    ],
  },
  {
    date: "2026-02-24",
    title: "Infrastructure and Energy Roundup",
    summary:
      "Infrastructure projects continue progressing while energy pricing stayed within a tighter trading range.",
    highlights: [
      "Two large procurement announcements accelerated regional timelines.",
      "Forward pricing indicated less volatility than earlier in the month.",
      "Capital project financing conditions remained generally supportive.",
    ],
  },
  {
    date: "2026-02-23",
    title: "Consumer Watch",
    summary:
      "A pulse check on consumer behavior, discretionary spend, and early spring inventory positioning.",
    highlights: [
      "Category-level demand was strongest in essentials and health products.",
      "Promotional cadence remained elevated but less aggressive week over week.",
      "Brands continued prioritizing inventory discipline over top-line growth.",
    ],
  },
];

export function getPublishedBriefs(): Brief[] {
  return publishedBriefs;
}

export function getLatestPublishedBrief(): Brief | undefined {
  return publishedBriefs[0];
}

export function getBriefByDate(date: string): Brief | undefined {
  return publishedBriefs.find((brief) => brief.date === date);
}
