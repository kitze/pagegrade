import {
  COLORS,
  GRADES,
  grade,
  PAGE_METRICS,
  SECTION_METRICS,
  type Metric,
  type Scores,
} from "./rubric";
import type { Report } from "./report";

export const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export const count = (n: number) => n.toLocaleString();
export const badge = (score: number, small = false) =>
  `<span class="grade ${small ? "small" : ""}" style="--grade:${COLORS[grade(Math.round(score))]}">${grade(Math.round(score))}</span>`;
const scoreBar = (value: number) =>
  `<span class="bar"><i style="width:${Math.max(0, Math.min(100, value))}%;background:${COLORS[grade(Math.round(value))]}"></i></span>`;

function metricsTable(metrics: Metric[], scores: Scores) {
  return `<div class="metrics">${metrics.map((m) => `<details class="metric"><summary><span>${m.label}</span>${scoreBar(scores[m.id]!)}<strong>${Math.round(scores[m.id]!)}</strong><span class="chevron">+</span></summary><div class="metric-detail"><p>${escape(m.question)}</p><p><b>Rubric anchor:</b> ${escape(m.levels[Math.min(4, Math.round(scores[m.id]! / 25))]!)}</p>${scores[m.id]! < 70 ? `<p class="fix"><b>Try:</b> ${escape(m.fix)}</p>` : ""}<small>${m.weight}% of this component · 0–4 rubric converted to 0–100</small></div></details>`).join("")}</div>`;
}
function scale(value: number) {
  return `<div class="scale" aria-label="Grade ${grade(value)}. A: 85–100, B: 70–84, C: 55–69, D: 40–54, E: below 40">${GRADES.map((g) => `<span class="${grade(value) === g ? "active" : ""}" style="--grade:${COLORS[g]}">${g}</span>`).join("")}</div>`;
}
export function overview(report: Report) {
  const score = report.overall ?? Math.round(report.sectionScore);
  const priorities = report.sections
    .flatMap((s) =>
      SECTION_METRICS.filter((m) => s.scores[m.id]! < 70).map((m) => ({
        section: s,
        metric: m,
        score: s.scores[m.id]!,
      })),
    )
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);
  return `<section class="score-summary"><div><div class="eyebrow">${report.overall !== undefined ? "Page grade" : "Scored sections average"}</div><div class="big-score">${report.sections.length ? badge(score) : "—"}<div><b>${report.sections.length ? score : "—"}<span>/100</span></b>${scale(score)}</div></div></div><dl class="facts"><div><dt>Sections</dt><dd>${report.sections.length} / ${report.totalSections}</dd></div><div><dt>Words</dt><dd>${count(report.totalWords)}</dd></div><div><dt>Read time</dt><dd>~${Math.max(1, Math.round(report.totalWords / 220))} min</dd></div></dl></section>
  ${report.partial ? `<p class="notice">Extraction safety limit reached. Some content was not extracted; shown grades cover scored text only.</p>` : ""}
  <div class="components">${[
    {
      name: "Section quality",
      score: report.sectionScore,
      weight: report.overall !== undefined ? "70%" : "",
    },
    ...(report.pageScore !== undefined
      ? [{ name: "Page composition", score: report.pageScore, weight: "20%" }]
      : []),
    {
      name: "On-page checks",
      score: report.seoScore,
      weight: report.overall !== undefined ? "10%" : "Local",
    },
  ]
    .map(
      (c) =>
        `<div><div><span>${c.name}</span><small>${c.weight}</small></div><b>${Math.round(c.score)}</b>${scoreBar(c.score)}</div>`,
    )
    .join("")}</div>
  ${priorities.length ? `<section><h2>Improve first</h2><div class="priorities">${priorities.map((p) => `<button data-select="${p.section.id}" class="priority"><span class="priority-score">${Math.round(p.score)}</span><span><b>${escape(p.metric.label)}</b><span>${escape(p.section.title)}</span><small>${escape(p.metric.fix)}</small></span><span aria-hidden="true">↗</span></button>`).join("")}</div><p class="footnote">Suggestions are rubric guidance, not generated rewrites.</p></section>` : ""}
  ${report.pageScores ? `<section><h2>Page composition</h2>${metricsTable(PAGE_METRICS, report.pageScores)}</section>` : ""}
  <section><h2>On-page checks <span>Local · no model</span></h2><div class="checks">${report.seo.map((c) => `<details><summary><span class="check-dot" style="background:${COLORS[grade(c.value)]}"></span><span>${c.label}</span><strong>${Math.round(c.value)}</strong></summary><p>${escape(c.detail)}</p></details>`).join("")}</div></section>`;
}
export function sectionDetail(report: Report, selected: string) {
  const s = report.sections.find((item) => item.id === selected);
  if (!s) return overview(report);
  return `<section class="section-heading"><div>${badge(s.score)}<div><div class="eyebrow">Section ${report.sections.indexOf(s) + 1} · ${count(s.words)} words${s.clipped ? " · sampled" : ""}${(s.chunks ?? 1) > 1 ? ` · ${s.chunks} chunks` : ""}</div><h1>${escape(s.title)}</h1><span class="muted">${Math.round(s.score)} / 100</span></div></div><button class="button secondary" id="locate">Locate on page ↗</button></section>${s.clipped ? '<p class="notice">Only the first part of this section was evaluated. Grade applies to that sample.</p>' : ""}
    ${(s.chunks ?? 1) > 1 ? '<p class="notice">Full text evaluated in chunks. Scores average passage-level judgments; cross-chunk flow is not assessed.</p>' : ""}${metricsTable(SECTION_METRICS, s.scores)}<p class="footnote">Expand a metric for rubric, weight and improvement guidance.</p>`;
}
