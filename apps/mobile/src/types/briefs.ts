export type SourceLink = {
  label: string;
  url: string;
};

export type Story = {
  id: string;
  position: number;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  sources: SourceLink[];
};

export type BriefWithStories = {
  id: string;
  briefDate: string;
  title: string | null;
  stories: Story[];
};

export type ArchiveItem = {
  id: string;
  briefDate: string;
  title: string | null;
};
