export type CandidateSource = {
  label: string;
  url: string;
};

export type CandidateStoryAssignment = {
  position: number;
  headline: string;
  summary: string;
  sources: CandidateSource[];
};

export type CandidateStoryAssignmentEvent = {
  id: number;
  payload: CandidateStoryAssignment;
};

export type BriefLoadDateEvent = {
  id: number;
  date: string;
};
