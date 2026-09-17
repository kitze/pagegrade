import type { Snapshot } from "./extract";
import {
  PAGE_METRICS,
  SECTION_METRICS,
  overallScore,
  sectionMean,
  weighted,
  type Scores,
} from "./rubric";

export function seoChecks(page: Snapshot) {
  const s = page.seo;
  return [
    {
      label: "Document title",
      value: s.titleLength > 0 ? 100 : 0,
      detail: `${s.titleLength} characters; descriptive presence, no hard length penalty.`,
    },
    {
      label: "Meta description",
      value: s.descriptionLength > 0 ? 100 : 0,
      detail: `${s.descriptionLength} characters; presence only, not a ranking factor claim.`,
    },
    {
      label: "Main heading",
      value: s.h1Count === 1 ? 100 : s.h1Count > 1 ? 60 : 0,
      detail: `${s.h1Count} visible H1 headings. One is a clarity convention, not a search requirement.`,
    },
    {
      label: "Heading hierarchy",
      value: s.headingSkips ? 50 : 100,
      detail: s.headingSkips ? "Heading levels skip a step." : "No skipped heading levels found.",
    },
    {
      label: "Image alternatives",
      value: s.images ? (100 * (s.images - s.missingAlt)) / s.images : 100,
      detail: `${s.missingAlt} of ${s.images} visible images lack an alt attribute. Empty decorative alt is allowed; quality not checked.`,
    },
    {
      label: "Document language",
      value: s.hasLang ? 100 : 0,
      detail: s.hasLang ? "Language attribute present." : "Language attribute missing.",
    },
  ];
}
export interface Report {
  version: number;
  title: string;
  origin: string;
  partial: boolean;
  totalSections: number;
  totalWords: number;
  coverage: number;
  analyzedAt: string;
  durationMs: number;
  sections: {
    id: string;
    title: string;
    words: number;
    clipped: boolean;
    scores: Scores;
    score: number;
  }[];
  pageScores: Scores;
  seo: ReturnType<typeof seoChecks>;
  sectionScore: number;
  pageScore: number;
  seoScore: number;
  overall: number;
}
export function buildReport(
  snapshot: Snapshot,
  sections: Scores[],
  pageScores: Scores,
  durationMs: number,
): Report {
  if (sections.length !== snapshot.sections.length || sections.some((s) => !s))
    throw new Error("Incomplete section analysis.");
  const scored = snapshot.sections.map((s, i) => ({
    id: s.id,
    title: s.title,
    words: s.words,
    clipped: s.clipped,
    scores: sections[i]!,
    score: weighted(sections[i]!, SECTION_METRICS),
  }));
  const checks = seoChecks(snapshot);
  const sectionScore = sectionMean(scored);
  const pageScore = weighted(pageScores, PAGE_METRICS);
  const seoScore = checks.reduce((sum, c) => sum + c.value, 0) / checks.length;
  return {
    version: 1,
    title: snapshot.title,
    origin: new URL(snapshot.url).origin,
    partial: snapshot.partial,
    totalSections: snapshot.totalSections,
    totalWords: snapshot.totalWords,
    coverage: snapshot.totalChars
      ? Math.round((snapshot.includedChars / snapshot.totalChars) * 100)
      : 0,
    analyzedAt: new Date().toISOString(),
    durationMs,
    sections: scored,
    pageScores,
    seo: checks,
    sectionScore,
    pageScore,
    seoScore,
    overall: overallScore(sectionScore, pageScore, seoScore),
  };
}
export interface Status {
  state: "idle" | "running" | "done" | "error";
  completed: number;
  total: number;
  error?: string;
  report?: Report;
}
export const IDLE: Status = { state: "idle", completed: 0, total: 0 };
