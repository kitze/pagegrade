// Render the production report view from a synthetic live-smoke result, without mocking Chrome APIs.
import { readFileSync, writeFileSync } from "node:fs";
import { overview, sectionDetail, escape, badge } from "../lib/view";
import type { Report } from "../lib/report";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Usage: bun scripts/render-smoke.ts REPORT.json OUTPUT.html");
const report = JSON.parse(readFileSync(input, "utf8")) as Report;
const css = readFileSync(new URL("../entrypoints/report/style.css", import.meta.url), "utf8");
const views = {
  overview: overview(report),
  ...Object.fromEntries(report.sections.map((s) => [s.id, sectionDetail(report, s.id)])),
};
const json = JSON.stringify(views).replace(/</g, "\\u003c");
writeFileSync(
  output,
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PageGrade · synthetic smoke</title><style>${css}</style></head><body>
<header class="topbar"><span class="brand"><span class="brand-mark">P<span>G</span></span>PageGrade</span><span class="provider">Live Jev result · synthetic fixture</span></header>
<main class="shell"><div class="page-heading"><div><div class="eyebrow">Synthetic smoke · ${escape(report.origin)}</div><h1>${escape(report.title)}</h1></div></div><div class="report-grid"><aside class="sidebar"><button class="nav-row selected" data-select="overview"><span>Overview</span>${badge(report.overall, true)}</button><div class="nav-label">Sections</div>${report.sections.map((s) => `<button class="nav-row" data-select="${s.id}"><span>${escape(s.title)}</span>${badge(s.score, true)}</button>`).join("")}</aside><div class="report-content">${views.overview}</div></div><footer>Production report renderer; synthetic live Jev data. Browser extension APIs are not exercised by this preview.</footer></main>
<script>const views=${json};document.addEventListener('click',e=>{const button=e.target.closest('[data-select]');if(!button)return;document.querySelector('.report-content').innerHTML=views[button.dataset.select];document.querySelectorAll('.nav-row').forEach(b=>b.classList.toggle('selected',b.dataset.select===button.dataset.select));const locate=document.querySelector('#locate');if(locate){locate.disabled=true;locate.title='Available in the extension only';}});</script></body></html>`,
);
console.log(`Rendered ${report.sections.length} sections to ${output}`);
