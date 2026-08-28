import themeEvidence from "../../../public/synthesis/theme-evidence-ui.json";

export type ThemeEvidenceQuote = {
  text: string;
  session: string;
  note?: string;
};

export type ThemeEvidence = {
  title: string;
  narrative?: string;
  sessions: string[];
  insights: string[];
  conflicts: string[];
  quotes: ThemeEvidenceQuote[];
};

export const THEME_EVIDENCE_UI = themeEvidence as Record<string, ThemeEvidence>;
