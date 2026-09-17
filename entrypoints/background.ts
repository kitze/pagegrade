import { browser } from "wxt/browser";
import { z } from "zod";
import { extractPage, focusSection, type Snapshot } from "../lib/extract";
import { evaluate, pageRequest } from "../lib/jev";
import { evaluateSection, canAssessPage } from "../lib/chunks";
import { renderOverlays } from "../lib/overlays";
import { buildSectionReport, IDLE, type Status, type Report } from "../lib/report";
import { COLORS, grade, PAGE_METRICS, weighted, overallScore } from "../lib/rubric";

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings") }),
  z.object({ type: z.literal("saveKey"), key: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("removeKey") }),
  ...(["status", "preview", "analyze", "assessPage", "cancel", "forget"] as const).map((type) =>
    z.object({ type: z.literal(type), tabId: z.number().int().nonnegative() }),
  ),
  z.object({
    type: z.literal("focus"),
    tabId: z.number().int().nonnegative(),
    sectionId: z.string(),
  }),
  z.object({
    type: z.literal("overlays"),
    tabId: z.number().int().nonnegative(),
    enabled: z.boolean(),
  }),
]);
type Anchors = { hash: string; url: string; selectors: { id: string; selector: string }[] };

export default defineBackground(() => {
  const jobs = new Map<number, AbortController>();
  const pageUpdates = new Map<number, Promise<unknown>>();
  const accessReady = Promise.all([
    browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const statusKey = (id: number) => `report:${id}`;
  const anchorKey = (id: number) => `anchors:${id}`;
  const getStatus = async (id: number): Promise<Status> =>
    ((await browser.storage.session.get(statusKey(id)))[statusKey(id)] as Status) ?? IDLE;
  const setStatus = async (id: number, status: Status) => {
    await browser.storage.session.set({ [statusKey(id)]: status });
  };
  const getAnchors = async (id: number) =>
    (await browser.storage.session.get(anchorKey(id)))[anchorKey(id)] as Anchors | undefined;
  const draw = async (id: number, report?: Report) => {
    const anchors = await getAnchors(id);
    const config = await browser.storage.session.get(`overlays:${id}`);
    const items =
      config[`overlays:${id}`] === false
        ? []
        : (report?.sections ?? []).flatMap((s) => {
            const index = anchors?.selectors.findIndex((a) => a.id === s.id) ?? -1;
            const anchor = anchors?.selectors[index];
            return anchor
              ? [
                  {
                    id: s.id,
                    selector: anchor.selector,
                    nextSelector: anchors?.selectors[index + 1]?.selector,
                    label: `${grade(Math.round(s.score))} · ${Math.round(s.score)}`,
                    color: COLORS[grade(Math.round(s.score))],
                    title: `${s.title}: ${Math.round(s.score)}/100. Open section breakdown.`,
                  },
                ]
              : [];
          });
    await browser.scripting
      .executeScript({ target: { tabId: id }, func: renderOverlays, args: [items] })
      .catch(() => undefined);
  };
  const cancel = async (id: number) => {
    jobs.get(id)?.abort();
    jobs.delete(id);
    const old = await getStatus(id);
    if (old.state === "running")
      await setStatus(id, {
        ...old,
        state: "done",
        error: "Stopped. Completed section scores kept.",
      });
  };
  const clear = async (id: number) => {
    jobs.get(id)?.abort();
    jobs.delete(id);
    await draw(id);
    await browser.storage.session.remove([statusKey(id), anchorKey(id)]);
    await browser.action.setBadgeText({ tabId: id, text: "" }).catch(() => undefined);
  };
  const getSnapshot = async (tabId: number): Promise<Snapshot> => {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !/^https?:\/\//.test(tab.url))
      throw new Error(
        "Click PageGrade's toolbar icon on this web page to grant access. Browser pages and PDFs are unsupported.",
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
        "Cannot read this tab. Click PageGrade's toolbar icon on the page. Protected pages, PDFs and pages without readable text are unsupported.",
      );
    }
  };
  const fingerprint = async (snapshot: Snapshot) => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(snapshot)),
    );
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  const run = async (tabId: number, controller: AbortController, wholePage: boolean) => {
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
      if (wholePage) {
        const before = await getStatus(tabId),
          anchors = await getAnchors(tabId);
        if (
          !before.report ||
          !canAssessPage(snapshot) ||
          anchors?.hash !== hash ||
          before.report.sections.length !== snapshot.sections.length
        )
          throw new Error(
            "Whole-page assessment needs complete section scores and at most 60,000 characters. Section scores remain available.",
          );
        const pageScores = await evaluate(
          pageRequest(snapshot),
          PAGE_METRICS,
          apiKey,
          controller.signal,
        );
        check();
        if ((await fingerprint(await getSnapshot(tabId))) !== hash)
          throw new Error("Page changed. Whole-page result discarded.");
        check();
        const pageScore = weighted(pageScores, PAGE_METRICS);
        const report = {
          ...before.report,
          pageScores,
          pageScore,
          overall: overallScore(before.report.sectionScore, pageScore, before.report.seoScore),
        };
        await setStatus(tabId, {
          ...before,
          state: "done",
          phase: undefined,
          error: undefined,
          report,
        });
        return;
      }
      await browser.storage.session.set({
        [anchorKey(tabId)]: {
          hash,
          url: snapshot.url,
          selectors: snapshot.sections.map(({ id, selector }) => ({ id, selector })),
        },
      });
      const results = new Map<string, Awaited<ReturnType<typeof evaluateSection>>>();
      const failures = new Map<string, string>();
      let completed = 0,
        next = 0;
      // Serialize publication so two workers cannot overwrite newer progress.
      let publishing = Promise.resolve();
      const publish = () => {
        publishing = publishing.then(async () => {
          check();
          const report = buildSectionReport(snapshot, results, failures, Date.now() - start);
          await setStatus(tabId, {
            state: "running",
            phase: "sections",
            total: snapshot.sections.length,
            completed,
            report,
          });
          check();
          await draw(tabId, report);
        });
        return publishing;
      };
      await publish();
      await browser.action.setBadgeText({ tabId, text: "…" });
      const worker = async () => {
        while (next < snapshot.sections.length) {
          check();
          const section = snapshot.sections[next++]!;
          try {
            results.set(
              section.id,
              await evaluateSection(snapshot, section, apiKey, controller.signal),
            );
          } catch (error) {
            check();
            failures.set(section.id, error instanceof Error ? error.message : "Section failed.");
          }
          check();
          completed++;
          await publish();
        }
      };
      await Promise.all([worker(), worker()]);
      check();
      if ((await fingerprint(await getSnapshot(tabId))) !== hash) {
        await draw(tabId);
        await setStatus(tabId, {
          state: "error",
          completed: 0,
          total: 0,
          error: "Page changed during analysis. Analyze again for current section scores.",
        });
        return;
      }
      check();
      const report = buildSectionReport(snapshot, results, failures, Date.now() - start);
      await setStatus(tabId, {
        state: "done",
        total: snapshot.sections.length,
        completed,
        report,
        error: failures.size
          ? `${failures.size} section(s) failed. Successful section scores were kept.`
          : undefined,
      });
      await browser.action.setBadgeText({
        tabId,
        text: report.sections.length ? grade(Math.round(report.sectionScore)) : "!",
      });
      await browser.action.setBadgeBackgroundColor({
        tabId,
        color: COLORS[grade(Math.round(report.sectionScore))],
      });
    } catch (error) {
      if (jobs.get(tabId) === controller) {
        controller.abort();
        const old = await getStatus(tabId);
        await setStatus(tabId, {
          ...old,
          state: "error",
          error: error instanceof Error ? error.message : "Analysis failed.",
        });
      }
    } finally {
      if (jobs.get(tabId) === controller) jobs.delete(tabId);
    }
  };

  browser.tabs.onRemoved.addListener((id) => {
    pageUpdates.delete(id);
    void clear(id);
  });
  browser.tabs.onUpdated.addListener((id, change) => {
    if (change.status === "loading" || change.url) void clear(id);
  });
  browser.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
    // Opening must happen synchronously in the user-gesture message handler.
    const pageMessage = z
      .object({ type: z.enum(["selectSection", "sectionStale"]), sectionId: z.string().max(30) })
      .safeParse(raw);
    const trustedPage =
      sender.id === browser.runtime.id &&
      sender.tab?.id !== undefined &&
      sender.frameId === 0 &&
      /^https?:\/\//.test(sender.url ?? "");
    let opening: Promise<void> | undefined;
    if (trustedPage && pageMessage.success && pageMessage.data.type === "selectSection")
      opening = browser.sidePanel.open({ tabId: sender.tab!.id! }).catch(() => undefined);
    const handle = async () => {
      if (trustedPage && pageMessage.success) {
        const id = sender.tab!.id!,
          message = pageMessage.data;
        const anchors = await getAnchors(id),
          old = await getStatus(id);
        if (
          !anchors ||
          anchors.url !== sender.url ||
          !old.report?.sections.some((s) => s.id === message.sectionId)
        )
          throw new Error("Unknown section.");
        if (message.type === "selectSection") {
          await opening;
          await setStatus(id, { ...old, selected: message.sectionId });
          return null;
        }
        await cancel(id);
        const report = {
          ...old.report,
          sections: old.report.sections.filter((s) => s.id !== message.sectionId),
          remaining: [
            ...(old.report.remaining ?? []),
            {
              id: message.sectionId,
              title: old.report.sections.find((s) => s.id === message.sectionId)!.title,
              error: "Section changed; analyze again.",
            },
          ],
          pageScores: undefined,
          pageScore: undefined,
          overall: undefined,
          pageEligible: false,
        };
        // Do not present an outdated aggregate after invalidation.
        report.sectionScore = report.sections.length
          ? report.sections.reduce(
              (n, s) => n + s.score * Math.sqrt(Math.min(Math.max(s.words, 1), 500)),
              0,
            ) /
            report.sections.reduce((n, s) => n + Math.sqrt(Math.min(Math.max(s.words, 1), 500)), 0)
          : 0;
        await setStatus(id, {
          ...old,
          state: "done",
          report,
          error: "Page content changed. Analyze again to update changed sections.",
        });
        return null;
      }
      if (
        sender.id !== browser.runtime.id ||
        !sender.url ||
        sender.url.split("?")[0] !== browser.runtime.getURL("/report.html")
      )
        throw new Error("Side panel access required.");
      await accessReady;
      const message = messageSchema.parse(raw);
      if (message.type === "settings") {
        const { apiKey } = await browser.storage.local.get("apiKey");
        return { hasKey: typeof apiKey === "string" && !!apiKey };
      }
      if (message.type === "saveKey") {
        for (const id of jobs.keys()) await cancel(id);
        await browser.storage.local.set({ apiKey: message.key });
        return null;
      }
      if (message.type === "removeKey") {
        for (const id of jobs.keys()) await cancel(id);
        await browser.storage.local.remove("apiKey");
        return null;
      }
      const id = message.tabId;
      if (message.type === "status") {
        const status = await getStatus(id);
        if (status.state === "running" && !jobs.has(id)) {
          const interrupted: Status = {
            ...status,
            state: "error",
            error: "Analysis interrupted. Completed section scores kept.",
          };
          await setStatus(id, interrupted);
          return interrupted;
        }
        return status;
      }
      if (message.type === "preview") {
        const page = await getSnapshot(id);
        return {
          title: page.title,
          origin: new URL(page.url).origin,
          sections: page.sections.length,
          words: page.totalWords,
          partial: page.partial,
        };
      }
      if (message.type === "analyze" || message.type === "assessPage") {
        if (jobs.has(id)) return null;
        if (jobs.size)
          throw new Error("Another page is being analyzed. Finish or cancel that run first.");
        const controller = new AbortController();
        jobs.set(id, controller);
        const old = await getStatus(id);
        await setStatus(id, {
          ...(message.type === "assessPage" ? old : IDLE),
          state: "running",
          phase: message.type === "assessPage" ? "page" : "sections",
          error: undefined,
        });
        void run(id, controller, message.type === "assessPage");
        return null;
      }
      if (message.type === "cancel") {
        await cancel(id);
        return null;
      }
      if (message.type === "forget") {
        await clear(id);
        return null;
      }
      if (message.type === "overlays") {
        await browser.storage.session.set({ [`overlays:${id}`]: message.enabled });
        await draw(id, (await getStatus(id)).report);
        return null;
      }
      if (message.type === "focus") {
        const anchors = await getAnchors(id);
        if (!anchors || (await fingerprint(await getSnapshot(id))) !== anchors.hash)
          throw new Error("Page changed. Analyze again before locating a section.");
        const anchor = anchors.selectors.find((s) => s.id === message.sectionId);
        if (!anchor) throw new Error("Section not found.");
        await browser.scripting.executeScript({
          target: { tabId: id },
          func: focusSection,
          args: [anchor.selector],
        });
        return null;
      }
    };
    const task = trustedPage
      ? (pageUpdates.get(sender.tab!.id!) ?? Promise.resolve()).catch(() => undefined).then(handle)
      : handle();
    if (trustedPage) pageUpdates.set(sender.tab!.id!, task);
    void task.then(
      (data) => respond({ ok: true, data }),
      (error) =>
        respond({ ok: false, error: error instanceof Error ? error.message : "Request failed." }),
    );
    return true;
  });
});
