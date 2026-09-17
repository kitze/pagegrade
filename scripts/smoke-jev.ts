// Only synthetic content. Credentials come from the caller's environment.
import { writeFileSync } from "node:fs";
import { evaluate, pageRequest } from "../lib/jev";
import { evaluateSection } from "../lib/chunks";
import { buildSectionReport } from "../lib/report";
import { PAGE_METRICS } from "../lib/rubric";
import type { Snapshot } from "../lib/extract";

const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error("AI_GATEWAY_API_KEY is required.");
const page: Snapshot = {
  url: "https://example.com/growing-basil",
  title: "Growing basil on a windowsill",
  language: "en",
  description: "Plant, water and harvest basil in a sunny window.",
  totalSections: 2,
  totalWords: 94,
  totalChars: 565,
  includedChars: 565,
  partial: false,
  walkLimited: false,
  seo: {
    titleLength: 31,
    descriptionLength: 49,
    h1Count: 1,
    headingSkips: false,
    images: 0,
    missingAlt: 0,
    hasLang: true,
  },
  sections: [
    {
      id: "s1",
      title: "Planting basil",
      text: "Choose a pot with drainage holes and place it on a saucer. Fill it with potting mix, leaving two centimetres below the rim. Sow seeds about half a centimetre deep and water gently. Place the pot in a sunny window. Basil grows best in warm conditions; protect seedlings from cold drafts.",
      words: 52,
      selector: "h1",
      clipped: false,
    },
    {
      id: "s2",
      title: "Water and harvest",
      text: "Check the soil daily. Water when the top centimetre feels dry, and empty standing water from the saucer. Once the plant has several pairs of leaves, pinch off the top leaves above a leaf pair. Leave enough foliage for the plant to keep growing.",
      words: 44,
      selector: "h2",
      clipped: false,
    },
  ],
};
if (process.env.SMOKE_LONG === "1")
  page.sections[0]!.text = (page.sections[0]!.text + " ").repeat(25).trim();
for (const section of page.sections) section.words = section.text.split(/\s+/).length;
page.totalWords = page.sections.reduce((n, s) => n + s.words, 0);
page.totalChars = page.sections.reduce((n, s) => n + s.text.length, 0);
page.includedChars = page.totalChars;
const start = Date.now();
const signal = AbortSignal.timeout(90_000);
const results = await Promise.all(
  page.sections.map(async (s) => [s.id, await evaluateSection(page, s, key, signal)] as const),
);
const report = buildSectionReport(page, new Map(results), new Map(), Date.now() - start);
if (report.overall !== undefined)
  throw new Error("Section-only run must not invent a whole-page grade.");
const pageScores =
  process.env.SMOKE_PAGE === "1"
    ? await evaluate(pageRequest(page), PAGE_METRICS, key, signal)
    : undefined;
console.log(
  JSON.stringify(
    {
      elapsedMs: report.durationMs,
      sections: report.sections.length,
      sectionMetrics: report.sections.map((s) => Object.keys(s.scores).length),
      chunks: report.sections.map((s) => s.chunks),
      pageMetrics: pageScores ? Object.keys(pageScores).length : 0,
      overall: report.overall ?? null,
      sectionScores: report.sections.map((s) => Math.round(s.score)),
    },
    null,
    2,
  ),
);
if (process.env.SMOKE_REPORT_PATH)
  writeFileSync(process.env.SMOKE_REPORT_PATH, JSON.stringify(report, null, 2));
