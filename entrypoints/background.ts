import { browser } from "wxt/browser";
import { z } from "zod";
import { extractPage, focusSection, type Snapshot } from "../lib/extract";
import { evaluate, pageRequest, sectionRequest } from "../lib/jev";
import { buildReport, IDLE, type Status } from "../lib/report";
import { COLORS, grade, PAGE_METRICS, SECTION_METRICS } from "../lib/rubric";

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings") }),
  z.object({ type: z.literal("saveKey"), key: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("removeKey") }),
  z.object({ type: z.literal("status"), tabId: z.number().int().nonnegative() }),
  z.object({ type: z.literal("preview"), tabId: z.number().int().nonnegative() }),
  z.object({ type: z.literal("analyze"), tabId: z.number().int().nonnegative() }),
  z.object({ type: z.literal("cancel"), tabId: z.number().int().nonnegative() }),
  z.object({ type: z.literal("forget"), tabId: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("focus"),
    tabId: z.number().int().nonnegative(),
    sectionId: z.string(),
  }),
]);

export default defineBackground(() => {
  const jobs = new Map<number, AbortController>();
  const accessReady = Promise.all([
    browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);
  const statusKey = (id: number) => `report:${id}`;
  const anchorKey = (id: number) => `anchors:${id}`;
  const setStatus = async (id: number, status: Status) => {
    await browser.storage.session.set({ [statusKey(id)]: status });
  };
  const clear = async (id: number) => {
    jobs.get(id)?.abort();
    jobs.delete(id);
    await browser.storage.session.remove([statusKey(id), anchorKey(id)]);
    await browser.action.setBadgeText({ tabId: id, text: "" }).catch(() => undefined);
  };
  const getSnapshot = async (tabId: number): Promise<Snapshot> => {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !/^https?:\/\//.test(tab.url))
      throw new Error(
        "Open a normal web page, then click PageGrade there. Browser pages, PDFs and stores may not be accessible.",
      );
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId },
        func: extractPage,
      });
      if (!result?.result?.sections.length) throw new Error("empty");
      return result.result;
    } catch {
      throw new Error(
        "Cannot read this page. Click PageGrade on the source tab again. Protected pages, PDFs and pages without readable text are unsupported.",
      );
    }
  };
  const fingerprint = async (snapshot: Snapshot) => {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  const run = async (tabId: number, controller: AbortController) => {
    const start = Date.now();
    const check = () => {
      if (controller.signal.aborted || jobs.get(tabId) !== controller)
        throw new Error("Analysis cancelled.");
    };
    try {
      await accessReady;
      const { apiKey } = await browser.storage.local.get("apiKey");
      if (typeof apiKey !== "string" || !apiKey)
        throw new Error("Add your Vercel AI Gateway key first.");
      const snapshot = await getSnapshot(tabId);
      const hash = await fingerprint(snapshot);
      check();
      const total = snapshot.sections.length + 1;
      let completed = 0;
      await setStatus(tabId, { state: "running", total, completed });
      await browser.action.setBadgeText({ tabId, text: "…" });
      // Two workers, no automatic retries. Each section gets all ten questions.
      const scores: Awaited<ReturnType<typeof evaluate>>[] = [];
      let next = 0;
      const worker = async () => {
        while (next < snapshot.sections.length) {
          check();
          const i = next++;
          scores[i] = await evaluate(
            sectionRequest(snapshot, snapshot.sections[i]!),
            SECTION_METRICS,
            apiKey,
            controller.signal,
          );
          check();
          completed++;
          await setStatus(tabId, { state: "running", total, completed });
        }
      };
      await Promise.all([worker(), worker()]);
      const pageScores = await evaluate(
        pageRequest(snapshot),
        PAGE_METRICS,
        apiKey,
        controller.signal,
      );
      check();
      const fresh = await getSnapshot(tabId);
      if ((await fingerprint(fresh)) !== hash)
        throw new Error(
          "Page changed during analysis. Results discarded; try again on stable content.",
        );
      check();
      const report = buildReport(snapshot, scores, pageScores, Date.now() - start);
      await browser.storage.session.set({
        [anchorKey(tabId)]: {
          hash,
          selectors: Object.fromEntries(snapshot.sections.map((s) => [s.id, s.selector])),
        },
      });
      check();
      await setStatus(tabId, { state: "done", completed: total, total, report });
      await browser.action.setBadgeText({
        tabId,
        text: report.partial ? "~" + grade(report.overall) : grade(report.overall),
      });
      await browser.action.setBadgeBackgroundColor({ tabId, color: COLORS[grade(report.overall)] });
    } catch (error) {
      if (jobs.get(tabId) === controller) {
        controller.abort();
        await setStatus(tabId, {
          state: "error",
          completed: 0,
          total: 0,
          error: error instanceof Error ? error.message : "Analysis failed. Try again.",
        });
        await browser.action.setBadgeText({ tabId, text: "!" }).catch(() => undefined);
      }
    } finally {
      if (jobs.get(tabId) === controller) jobs.delete(tabId);
    }
  };

  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined)
      void browser.tabs.create({ url: browser.runtime.getURL(`/report.html?tab=${tab.id}`) });
  });
  browser.tabs.onRemoved.addListener((id) => {
    void clear(id);
  });
  browser.tabs.onUpdated.addListener((id, change) => {
    if (change.status === "loading" || change.url) void clear(id);
  });
  browser.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
    const handle = async () => {
      // No page/content-script API. Only this extension's report page may call.
      if (
        sender.id !== browser.runtime.id ||
        !sender.url ||
        sender.url.split("?")[0] !== browser.runtime.getURL("/report.html")
      )
        throw new Error("Report access required.");
      await accessReady;
      const message = messageSchema.parse(raw);
      if (message.type === "settings") {
        const { apiKey } = await browser.storage.local.get("apiKey");
        return { hasKey: typeof apiKey === "string" && !!apiKey };
      }
      if (message.type === "saveKey") {
        await browser.storage.local.set({ apiKey: message.key });
        return null;
      }
      if (message.type === "removeKey") {
        for (const id of jobs.keys()) await clear(id);
        await browser.storage.local.remove("apiKey");
        return null;
      }
      const id = message.tabId;
      if (message.type === "status") {
        const result = (await browser.storage.session.get(statusKey(id)))[statusKey(id)] as
          | Status
          | undefined;
        if (result?.state === "running" && !jobs.has(id)) {
          const interrupted: Status = {
            state: "error",
            completed: 0,
            total: 0,
            error: "Analysis interrupted. Retry to start a new run.",
          };
          await setStatus(id, interrupted);
          return interrupted;
        }
        return result ?? IDLE;
      }
      if (message.type === "preview") {
        const page = await getSnapshot(id);
        return {
          title: page.title,
          origin: new URL(page.url).origin,
          sections: page.sections.length,
          totalSections: page.totalSections,
          words: page.totalWords,
          partial: page.partial,
        };
      }
      if (message.type === "analyze") {
        if (jobs.has(id)) return null;
        // Global concurrency remains bounded even with many report tabs open.
        if (jobs.size)
          throw new Error("Another page is being analyzed. Finish or cancel that run first.");
        const controller = new AbortController();
        jobs.set(id, controller);
        await setStatus(id, { state: "running", completed: 0, total: 0 });
        void run(id, controller);
        return null;
      }
      if (message.type === "cancel" || message.type === "forget") {
        await clear(id);
        return null;
      }
      if (message.type === "focus") {
        const anchors = (await browser.storage.session.get(anchorKey(id)))[anchorKey(id)] as
          | { hash: string; selectors: Record<string, string> }
          | undefined;
        if (!anchors || (await fingerprint(await getSnapshot(id))) !== anchors.hash)
          throw new Error("Page changed. Analyze again before locating a section.");
        const selector = anchors.selectors[message.sectionId];
        if (!selector) throw new Error("Section not found.");
        const [result] = await browser.scripting.executeScript({
          target: { tabId: id },
          func: focusSection,
          args: [selector],
        });
        if (!result?.result) throw new Error("Section no longer present.");
        const tab = await browser.tabs.update(id, { active: true });
        if (tab?.windowId !== undefined)
          await browser.windows.update(tab.windowId, { focused: true });
        return null;
      }
    };
    void handle().then(
      (data) => respond({ ok: true, data }),
      (error) =>
        respond({ ok: false, error: error instanceof Error ? error.message : "Request failed." }),
    );
    return true;
  });
});
