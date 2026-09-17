import { browser } from "wxt/browser";
import { COLORS, GRADES } from "../../lib/rubric";
import { escape, count, badge, overview, sectionDetail } from "../../lib/view";
import { IDLE, type Status } from "../../lib/report";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app")!;
const tabParam = new URLSearchParams(location.search).get("tab");
const tabId = tabParam !== null ? Number(tabParam) : -1;
const validTab = Number.isInteger(tabId) && tabId >= 0;
let status: Status = IDLE;
let hasKey = false;
let selected = "overview";
let error = "";
let settingsOpen = false;
let preview: {
  title: string;
  origin: string;
  sections: number;
  totalSections: number;
  words: number;
  partial: boolean;
} | null = null;
async function send<T>(type: string, extra: Record<string, unknown> = {}): Promise<T> {
  const reply = await browser.runtime.sendMessage({ type, tabId, ...extra });
  if (!reply?.ok) throw new Error(reply?.error || "Extension unavailable. Reload this report.");
  return reply.data as T;
}
function render() {
  const report = status.report;
  const busy = status.state === "running";
  root.innerHTML = `<header class="topbar"><a class="brand" href="#"><span class="brand-mark">P<span>G</span></span>PageGrade</a><div><span class="provider">Jev / Vercel AI Gateway</span><button class="icon-button" id="settings" aria-expanded="${settingsOpen}">Connection ${hasKey ? '<i class="connected"></i>' : ""}</button></div></header>
    <main class="shell"><div class="page-heading"><div><div class="eyebrow">${escape(report?.origin ?? preview?.origin ?? "Current page")}</div><h1>${escape(report?.title ?? preview?.title ?? "PageGrade")}</h1></div><div class="actions">${report ? '<button class="button secondary" id="export">Export JSON</button><button class="button secondary" id="forget">Clear</button>' : ""}<button class="button ${busy ? "secondary" : "primary"}" id="analyze" ${!validTab || (!busy && !hasKey) ? "disabled" : ""}>${busy ? "Cancel analysis" : report ? "Analyze again" : "Analyze page"}</button></div></div>
    <section class="connection" ${settingsOpen || !hasKey ? "" : "hidden"}><form id="key-form"><label for="key">Vercel AI Gateway API key</label><div><input id="key" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${hasKey ? "Replace saved key" : "Enter your API key"}" required><button class="button primary" type="submit">Save key</button>${hasKey ? '<button class="button secondary" type="button" id="remove-key">Remove</button>' : ""}</div></form><p>Stored locally in this browser, not encrypted. Never sent to the page. <a href="https://vercel.com/ai-gateway" target="_blank" rel="noreferrer">Get a key ↗</a></p></section>
    ${error || status.error ? `<p class="notice error" role="alert">${escape(error || status.error!)}</p>` : ""}
    ${busy ? `<section class="progress" role="status"><div><b>Analyzing${status.total ? ` ${status.total - 1} sections` : " page"}</b><span>${status.completed} / ${status.total || "…"}</span></div><progress max="${status.total || 1}" value="${status.completed}"></progress><p>Ten criteria per section, then page composition. You can leave this report open in the background.</p></section>` : ""}
    ${report ? `<div class="report-grid"><aside class="sidebar"><button data-select="overview" class="nav-row ${selected === "overview" ? "selected" : ""}"><span>Overview</span>${badge(report.overall, true)}</button><div class="nav-label">Sections <span>${report.sections.length}</span></div>${report.sections.map((s, i) => `<button data-select="${s.id}" class="nav-row ${selected === s.id ? "selected" : ""}"><span class="nav-number">${String(i + 1).padStart(2, "0")}</span><span class="nav-title">${escape(s.title)}</span>${badge(s.score, true)}</button>`).join("")}<div class="sidebar-meta">${new Date(report.analyzedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${(report.durationMs / 1000).toFixed(1)}s<br>Rubric v${report.version}</div></aside><div class="report-content">${selected === "overview" ? overview(report) : sectionDetail(report, selected)}</div></div>` : !busy ? `<section class="empty"><div class="empty-scale">${GRADES.map((g) => `<span style="background:${COLORS[g]}">${g}</span>`).join("")}</div>${preview ? `<h2>${preview.sections} sections · ${count(preview.words)} words</h2>${preview.partial ? '<p class="notice">Page exceeds analysis limits; results will be marked as a sample.</p>' : ""}<p>Clarity, concision, specificity, explanation, usefulness, readability, flow, claim support, writing quality and search intent.</p>` : "<h2>Open PageGrade from a web page</h2>"}<p class="privacy">Clicking Analyze sends extracted visible main-page text, headings, title, description and language to Vercel AI Gateway / TypeSafe AI. URL, form values and hidden text are not sent. Don’t analyze sensitive pages.</p></section>` : ""}
    <footer><details><summary>Scoring & limitations</summary><p>Overall = 70% section quality + 20% page composition + 10% local on-page checks. Section averages use square-root word weighting, capped at 500 words. Ten weighted metrics per section; four page-wide metrics. A ≥85 · B ≥70 · C ≥55 · D ≥40 · E &lt;40.</p><p>Uncalibrated editorial rubric—not an SEO ranking prediction, accessibility audit, fact-check, or official Nutri-Score. Length and section count are judged against purpose, not fixed targets. Main readable DOM content only: navigation, footers, sidebars, forms, hidden content and iframes are excluded. Images/video meaning, shadow DOM, unloaded content, backlinks, crawling and performance are not assessed.</p><p>Limits: 40 sections, 6,000 characters per section, 60,000 overall. Anything clipped is explicitly a sample. Scores and headings stay in browser session memory until cleared, source navigation/close, or browser exit. No analytics. Source text is not saved in report history. Read time uses a rough 220 words/minute estimate.</p></details></footer></main>`;
  root.querySelector(".brand")?.addEventListener("click", (e) => {
    e.preventDefault();
    selected = "overview";
    render();
  });
  document.querySelector("#settings")?.addEventListener("click", () => {
    settingsOpen = !settingsOpen;
    render();
  });
  document.querySelector("#key-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = (document.querySelector("#key") as HTMLInputElement).value;
    void act(async () => {
      await send("saveKey", { key });
      hasKey = true;
      settingsOpen = false;
    });
  });
  document.querySelector("#remove-key")?.addEventListener(
    "click",
    () =>
      void act(async () => {
        await send("removeKey");
        hasKey = false;
      }),
  );
  document.querySelector("#analyze")?.addEventListener(
    "click",
    () =>
      void act(async () => {
        await send(busy ? "cancel" : "analyze");
      }),
  );
  document.querySelector("#forget")?.addEventListener(
    "click",
    () =>
      void act(async () => {
        await send("forget");
        selected = "overview";
      }),
  );
  document.querySelector("#locate")?.addEventListener(
    "click",
    () =>
      void act(async () => {
        await send("focus", { sectionId: selected });
      }),
  );
  document.querySelector("#export")?.addEventListener("click", () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "pagegrade-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-select]").forEach((button) =>
    button.addEventListener("click", () => {
      selected = button.dataset.select!;
      render();
    }),
  );
}
async function act(action: () => Promise<void>) {
  try {
    error = "";
    await action();
    status = await send<Status>("status");
  } catch (e) {
    error = e instanceof Error ? e.message : "Request failed.";
  }
  render();
}
async function init() {
  render();
  try {
    hasKey = (await send<{ hasKey: boolean }>("settings")).hasKey;
    if (!validTab)
      throw new Error("Click PageGrade's toolbar icon on the page you want to analyze.");
    status = await send<Status>("status");
    preview = await send("preview");
  } catch (e) {
    error = e instanceof Error ? e.message : "Page unavailable.";
  }
  render();
}
// Status updates are local storage events, not polling or repeated model calls.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;
  const change = changes[`report:${tabId}`];
  if (change) {
    status = (change.newValue as Status | undefined) ?? IDLE;
    render();
  }
});
void init();
