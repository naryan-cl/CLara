/**
 * Stream analytics types — Phase A uses existing Commons / graph / membership
 * tables only (no page_views telemetry; Ask question counts come later).
 */

export type AnalyticsRangePreset = "7d" | "30d" | "90d" | "all";

export type TimeseriesPoint = {
  date: string;
  value: number;
};

export type SeriesPoint = {
  date: string;
  chat: number;
  record: number;
  upload: number;
  session: number;
  other: number;
};

export type StreamAnalyticsSummary = {
  members: number;
  admins: number;
  documents: number;
  drafts: number;
  submitted: number;
  publicDocs: number;
  privateDocs: number;
  needsReview: number;
  sessions: number;
  attendanceMarks: number;
  comments: number;
  nodes: number;
  edges: number;
  nodesByType: Record<string, number>;
  themePicks: Record<string, number>;
};

export type StreamAnalyticsData = {
  range: AnalyticsRangePreset;
  startKey: string | null;
  endKey: string;
  summary: StreamAnalyticsSummary;
  creationsByType: SeriesPoint[];
  documentsOverTime: TimeseriesPoint[];
  sessionsOverTime: TimeseriesPoint[];
  membersOverTime: TimeseriesPoint[];
  nodesOverTime: TimeseriesPoint[];
};
