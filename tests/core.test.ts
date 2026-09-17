import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { JSDOM } from "jsdom";
import type { extractPage } from "../lib/extract";
import { parseScores, pageRequest, sectionRequest } from "../lib/jev";
import { buildReport } from "../lib/report";
import { SECTION_METRICS, PAGE_METRICS, grade, overallScore, sectionMean } from "../lib/rubric";

// Compile the injectable source without tsx's Node-only __name helper.
const extractSource = ts.transpileModule(
  readFileSync(new URL("../lib/extract.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  },
).outputText;

function extract(html: string) {
  const dom = new JSDOM(html, {
    url: "https://example.com/private?token=not-for-model",
    runScripts: "outside-only",
  });
  dom.window.CSS = { escape: (s: string) => s.replace(/[^\w-]/g, "_") } as unknown as typeof CSS;
  const fn = dom.window.eval(
    `(function () { const exports = {}; ${extractSource}; return exports.extractPage; })()`,
  ) as typeof extractPage;
  const result = dom.window.eval(`(${fn.toString()})()`) as ReturnType<typeof extractPage>;
  dom.window.close();
  return result;
}
const scores = (metrics = SECTION_METRICS, n = 3.2) =>
  Object.fromEntries(metrics.map((m) => [m.id, { type: "score", score: n }]));
const html = `<html lang="en"><head><title>A practical guide</title><meta name="description" content="How to start a useful project."></head><body><nav>Navigation secret</nav><main><h1>Getting started</h1><p>Choose one small problem. Write down who has it and what they do today.</p><section><h2>Build one thing</h2><p>Make the smallest version that solves that problem. Share it with one person.</p><input value="INPUT_SECRET"><form>FORM_SECRET</form><p hidden>HIDDEN_SECRET</p><div style="display:none">DISPLAY_SECRET</div><div contenteditable>EDIT_SECRET</div><img alt=""></section><h2>Measure</h2><p>Ask whether it helped. Record one result and decide what to change next.</p></main><footer>Footer secret</footer></body></html>`;

test("extracts non-overlapping heading sections and omits forms, hidden content and chrome", () => {
  const page = extract(html);
  assert.equal(page.sections.length, 3);
  assert.deepEqual(
    Array.from(page.sections, (s) => s.title),
    ["Getting started", "Build one thing", "Measure"],
  );
  const text = page.sections.map((s) => s.text).join(" ");
  for (const secret of ["SECRET", "Navigation secret", "Footer secret"])
    assert.ok(!text.includes(secret));
  assert.equal(page.partial, false);
  assert.equal(page.seo.h1Count, 1);
  assert.equal(page.seo.missingAlt, 0);
});
test("reads text-only pages and hidden ancestors safely", () => {
  assert.equal(extract("<body>Plain text page without headings.</body>").sections.length, 1);
  assert.equal(extract("<div hidden><main><p>Must not read.</p></main></div>").sections.length, 0);
});
test("long pages disclose clipping and section caps", () => {
  const page = extract(
    `<main>${Array.from({ length: 45 }, (_, i) => `<h2>Part ${i}</h2><p>${"Long content. ".repeat(600)}</p>`).join("")}</main>`,
  );
  assert.equal(page.partial, true);
  assert.equal(page.totalSections, 45);
  assert.ok(page.sections.length <= 40);
  assert.ok(page.sections.every((s) => s.text.length <= 6000));
  assert.ok(page.includedChars <= 60_000);
});
test("Gateway request sends content, not URL or DOM selectors", () => {
  const page = extract(html);
  for (const req of [sectionRequest(page, page.sections[0]!), pageRequest(page)]) {
    const serialized = JSON.stringify(req);
    assert.ok(!serialized.includes("not-for-model"));
    assert.ok(!serialized.includes("nth-of-type"));
    assert.ok(!serialized.includes("INPUT_SECRET"));
  }
  assert.equal(Object.keys(sectionRequest(page, page.sections[0]!).questions).length, 10);
});
test("fractional rubric scores normalize; missing, wrong-type and out-of-range scores fail closed", () => {
  assert.equal(parseScores({ answers: scores() }, SECTION_METRICS).clarity, 80);
  for (const answers of [
    {},
    { ...scores(), clarity: { type: "score", score: 5 } },
    { ...scores(), clarity: { type: "score", score: NaN } },
    { ...scores(), clarity: { type: "boolean", probability: 1 } },
    { ...scores(), extra: { type: "score", score: 4 } },
  ]) {
    assert.throws(() => parseScores({ answers }, SECTION_METRICS));
  }
});
test("weights sum to 100 and grades have explicit boundaries", () => {
  assert.equal(
    SECTION_METRICS.reduce((n, m) => n + m.weight, 0),
    100,
  );
  assert.equal(
    PAGE_METRICS.reduce((n, m) => n + m.weight, 0),
    100,
  );
  assert.deepEqual([0, 39, 40, 54, 55, 69, 70, 84, 85, 100].map(grade), [
    "E",
    "E",
    "D",
    "D",
    "C",
    "C",
    "B",
    "B",
    "A",
    "A",
  ]);
  assert.equal(overallScore(80, 60, 100), 78);
  assert.equal(
    sectionMean([
      { words: 500, score: 0 },
      { words: 100_000, score: 100 },
    ]),
    50,
  );
});
test("complete report contains scores but no source text or private URL", () => {
  const page = extract(html);
  const section = parseScores({ answers: scores() }, SECTION_METRICS);
  const pageScores = parseScores({ answers: scores(PAGE_METRICS) }, PAGE_METRICS);
  const report = buildReport(
    page,
    page.sections.map(() => section),
    pageScores,
    500,
  );
  assert.equal(report.overall, 82);
  assert.equal(report.coverage, 100);
  assert.ok(!JSON.stringify(report).includes("not-for-model"));
  assert.ok(!JSON.stringify(report).includes("Choose one small problem"));
  assert.throws(() => buildReport(page, [], pageScores, 0));
});
