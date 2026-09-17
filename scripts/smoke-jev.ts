// Only synthetic content. Credentials come from the caller's environment.
import { writeFileSync } from "node:fs";
import { evaluate, pageRequest, sectionRequest } from "../lib/jev";
import { buildReport } from "../lib/report";
import { PAGE_METRICS, SECTION_METRICS } from "../lib/rubric";
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
const start = Date.now();
const signal = AbortSignal.timeout(90_000);
const sections = await Promise.all(
  page.sections.map((s) => evaluate(sectionRequest(page, s), SECTION_METRICS, key, signal)),
);
const pageScores = await evaluate(pageRequest(page), PAGE_METRICS, key, signal);
const report = buildReport(page, sections, pageScores, Date.now() - start);
console.log(
  JSON.stringify(
    {
      elapsedMs: report.durationMs,
      sections: report.sections.length,
      sectionMetrics: report.sections.map((s) => Object.keys(s.scores).length),
      pageMetrics: Object.keys(pageScores).length,
      overall: report.overall,
      sectionScores: report.sections.map((s) => Math.round(s.score)),
    },
    null,
    2,
  ),
);
if (process.env.SMOKE_REPORT_PATH)
  writeFileSync(process.env.SMOKE_REPORT_PATH, JSON.stringify(report, null, 2));
