import { browser } from "wxt/browser";
import { escape, count, badge, overview, sectionDetail } from "../../lib/view";
import { IDLE, type Status } from "../../lib/report";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app")!;
let tabId = -1,
  epoch = 0;
let status: Status = IDLE,
  hasKey = false,
  selected = "overview",
  error = "",
  settingsOpen = false,
  overlays = true;
let preview: {
  title: string;
  origin: string;
  sections: number;
  words: number;
  partial: boolean;
} | null = null;
async function send<T>(type: string, extra: Record<string, unknown> = {}, id = tabId): Promise<T> {
  const reply = await browser.runtime.sendMessage({ type, tabId: id, ...extra });
  if (!reply?.ok) throw new Error(reply?.error || "Extension unavailable. Reopen PageGrade.");
  return reply.data as T;
}
function render() {
  const typedKey = document.querySelector<HTMLInputElement>("#key")?.value;
  const keyFocused = document.activeElement?.id === "key";
  const report = status.report,
    busy = status.state === "running";
  root.innerHTML = `<header class="topbar"><button class="brand brand-button" id="home"><span class="brand-mark">P<span>G</span></span>PageGrade</button><button class="icon-button" id="settings" aria-expanded="${settingsOpen}">Connection ${hasKey ? '<i class="connected"></i>' : ""}</button></header>
  <main class="shell panel-shell"><div class="page-heading"><div><div class="eyebrow">${escape(report?.origin ?? preview?.origin ?? "Current tab")}</div><h1>${escape(report?.title ?? preview?.title ?? "PageGrade")}</h1></div></div>
  <section class="connection" ${settingsOpen || !hasKey ? "" : "hidden"}><form id="key-form"><label for="key">Vercel AI Gateway API key</label><input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="${hasKey ? "Replace saved key" : "Enter your API key"}" required><div><button class="button primary" type="submit">Save key</button>${hasKey ? '<button class="button secondary" type="button" id="remove-key">Remove</button>' : ""}</div></form><p>Stored locally, not encrypted. Never sent to the page.</p></section>
  <div class="actions"><button class="button primary" id="analyze" ${tabId < 0 || (!busy && !hasKey) ? "disabled" : ""}>${busy ? "Stop" : report ? "Analyze again" : "Analyze sections"}</button>${report ? '<button class="button secondary" id="export">Export</button><button class="button secondary" id="forget">Clear</button>' : ""}</div>
  ${error || status.error ? `<p class="notice error" role="alert">${escape(error || status.error!)}</p>` : ""}
  ${busy ? `<section class="progress" role="status"><div><b>${status.phase === "page" ? "Assessing whole page" : "Scoring sections"}</b><span>${status.phase === "page" ? "" : `${status.completed} / ${status.total || "…"}`}</span></div><progress ${status.phase === "page" ? "" : `max="${status.total || 1}" value="${status.completed}"`}></progress></section>` : ""}
  ${
    report
      ? `<div class="report-controls"><label><input type="checkbox" id="overlays" ${overlays ? "checked" : ""}> Show scores on page</label><button class="button secondary" id="page-score" ${busy || !report.pageEligible ? "disabled" : ""}>${report.overall !== undefined ? "Reassess page" : "Assess whole page"}</button></div>${!report.pageEligible && !busy && report.overall === undefined ? '<p class="footnote">Whole-page assessment unavailable for incomplete results or pages over 60,000 characters. Section scores are independent.</p>' : ""}
  <nav class="section-picker" aria-label="Scored sections"><button data-select="overview" class="nav-row ${selected === "overview" ? "selected" : ""}"><span>Overview</span>${report.sections.length ? badge(report.overall ?? report.sectionScore, true) : ""}</button>${report.sections.map((s) => `<button data-select="${s.id}" class="nav-row ${selected === s.id ? "selected" : ""}"><span class="nav-title">${escape(s.title)}</span>${badge(s.score, true)}</button>`).join("")}${(report.remaining ?? []).map((s) => `<div class="nav-row pending"><span class="nav-title">${escape(s.title)}</span><span title="${escape(s.error ?? "Not scored yet")}">${s.error ? "Failed" : busy ? "Queued" : "Not scored"}</span></div>`).join("")}</nav>
  <div class="report-content">${selected === "overview" ? overview(report) : sectionDetail(report, selected)}</div>`
      : !busy
        ? `<section class="empty"><h2>${preview ? `${preview.sections} sections · ${count(preview.words)} words` : "Choose a web page"}</h2><p>10 criteria per section. Scores appear on the page as they finish.</p>${preview?.partial ? '<p class="notice">Extraction safety limit reached. Only extracted sections can be scored.</p>' : ""}</section>`
        : ""
  }
  <footer><p>Analyze sends main-page text, headings, title and description to Vercel AI Gateway / TypeSafe AI. Don’t analyze sensitive pages. URL and form values are not sent.</p><details><summary>Scoring & limitations</summary><p>Section average is not a whole-page assessment. Whole-page grade, when requested, combines 70% section quality, 20% composition and 10% local checks. A ≥85 · B ≥70 · C ≥55 · D ≥40 · E &lt;40.</p><p>Long sections use 6,000-character chunks. Their scores average passage-level judgments, not cross-chunk coherence. No section text is dropped for ordinary pages. Safety limits: 250 sections, 2 million characters, 100,000 DOM nodes. Hidden content, forms, navigation, iframes and unloaded content are excluded.</p><p>Editorial heuristic—not a ranking prediction, fact-check, accessibility audit or official Nutri-Score. Reports stay in this browser session until cleared or source navigation/close.</p></details></footer></main>`;
  if (typedKey) {
    const input = document.querySelector<HTMLInputElement>("#key");
    if (input) {
      input.value = typedKey;
      if (keyFocused) input.focus();
    }
  }
  document.querySelector("#home")?.addEventListener("click", () => {
    selected = "overview";
    render();
  });
  document.querySelector("#settings")?.addEventListener("click", () => {
    settingsOpen = !settingsOpen;
    render();
  });
  document.querySelector("#key-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#key")!,
      key = input.value;
    input.value = "";
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
  document.querySelector("#page-score")?.addEventListener(
    "click",
    () =>
      void act(async () => {
        await send("assessPage");
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
  document.querySelector<HTMLInputElement>("#overlays")?.addEventListener("change", (e) => {
    overlays = (e.target as HTMLInputElement).checked;
    void act(async () => {
      await send("overlays", { enabled: overlays });
    });
  });
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
  const current = epoch,
    id = tabId;
  try {
    error = "";
    await action();
    const next = await send<Status>("status", {}, id);
    if (epoch === current) status = next;
  } catch (e) {
    if (epoch === current) error = e instanceof Error ? e.message : "Request failed.";
  }
  if (epoch === current) render();
}
async function followTab() {
  const current = ++epoch;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (current !== epoch) return;
  tabId = tab?.id ?? -1;
  status = IDLE;
  selected = "overview";
  preview = null;
  error = "";
  render();
  if (tabId < 0) return;
  const id = tabId;
  try {
    const [next, page, stored] = await Promise.all([
      send<Status>("status", {}, id),
      send<typeof preview>("preview", {}, id),
      browser.storage.session.get(`overlays:${id}`),
    ]);
    if (current !== epoch) return;
    status = next;
    preview = page;
    selected = next.selected ?? "overview";
    overlays = stored[`overlays:${id}`] !== false;
  } catch (e) {
    if (current === epoch) error = e instanceof Error ? e.message : "Page unavailable.";
  }
  if (current === epoch) render();
}
browser.tabs.onActivated.addListener(() => {
  void followTab();
});
browser.tabs.onUpdated.addListener((id, change) => {
  if (id === tabId && change.status === "complete") void followTab();
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;
  const change = changes[`report:${tabId}`];
  if (change) {
    const next = (change.newValue as Status | undefined) ?? IDLE;
    if (next.selected && next.selected !== status.selected) selected = next.selected;
    status = next;
    render();
  }
});
async function init() {
  try {
    hasKey = (await send<{ hasKey: boolean }>("settings")).hasKey;
    await followTab();
  } catch (e) {
    error = e instanceof Error ? e.message : "Extension unavailable.";
    render();
  }
}
render();
void init();
