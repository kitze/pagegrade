export interface OverlayItem {
  id: string;
  selector: string;
  nextSelector?: string;
  label: string;
  color: string;
  title: string;
}

// Serialized by scripting.executeScript; no imports or extension secrets in page context.
export function renderOverlays(items: OverlayItem[]) {
  const world = globalThis as typeof globalThis & {
    __pagegradeCleanup?: () => void;
    chrome?: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } };
  };
  world.__pagegradeCleanup?.();
  if (!items.length) return;
  const host = document.createElement("div");
  host.setAttribute("data-pagegrade-ui", "");
  host.style.cssText =
    "position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial}button{position:fixed;pointer-events:auto;border:2px solid white;border-radius:7px;color:white;font:700 13px/1.2 system-ui;padding:7px 9px;box-shadow:0 2px 9px #0003;cursor:pointer;max-width:140px}button:focus-visible{outline:3px solid #161616;outline-offset:3px}.region{position:fixed;pointer-events:none;border:2px solid;border-radius:5px;box-sizing:border-box;background:#087f5b08;display:none}`;
  shadow.append(style);
  const entries = items.flatMap((item) => {
    const anchor = document.querySelector<HTMLElement>(item.selector);
    const next = item.nextSelector ? document.querySelector(item.nextSelector) : null;
    if (!anchor) return [];
    const scope =
      anchor.closest("section,article,main,[role=main]") ?? anchor.parentElement ?? anchor;
    const range = document.createRange();
    try {
      if (anchor === scope) range.setStart(scope, 0);
      else range.setStartBefore(anchor);
      if (next && anchor.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)
        range.setEndBefore(next);
      else range.setEnd(scope, scope.childNodes.length);
    } catch {
      range.selectNodeContents(scope);
    }
    const original = range.toString();
    const button = document.createElement("button");
    button.textContent = item.label;
    button.title = item.title;
    button.setAttribute("aria-label", item.title);
    button.style.background = item.color;
    const region = document.createElement("div");
    region.className = "region";
    region.style.borderColor = item.color;
    const highlight = (on: boolean) => {
      region.style.display = on ? "block" : "none";
    };
    button.addEventListener("mouseenter", () => highlight(true));
    button.addEventListener("mouseleave", () => highlight(false));
    button.addEventListener("focus", () => highlight(true));
    button.addEventListener("blur", () => highlight(false));
    let stale = false;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!stale)
        void world.chrome?.runtime
          ?.sendMessage({ type: "selectSection", sectionId: item.id })
          .catch(() => undefined);
    });
    shadow.append(region, button);
    return [
      {
        anchor,
        next,
        scope,
        range,
        original,
        button,
        region,
        invalidate: () => {
          if (stale) return;
          stale = true;
          button.textContent = "Changed";
          button.style.background = "#687069";
          button.title = "Section changed. Analyze again for an updated grade.";
          void world.chrome?.runtime
            ?.sendMessage({ type: "sectionStale", sectionId: item.id })
            .catch(() => undefined);
        },
      },
    ];
  });
  document.documentElement.append(host);
  let raf = 0;
  const place = () => {
    raf = 0;
    for (const entry of entries) {
      const { anchor, next, scope, button, region } = entry;
      if (!anchor.isConnected) {
        button.hidden = true;
        region.hidden = true;
        entry.invalidate();
        continue;
      }
      const a = anchor.getBoundingClientRect(),
        container = scope.getBoundingClientRect();
      const bottom = next?.isConnected ? next.getBoundingClientRect().top - 8 : container.bottom;
      const visible = a.top < innerHeight && Math.max(a.bottom, bottom) > 0 && container.width > 0;
      button.hidden = !visible;
      region.hidden = !visible;
      const x = Math.max(
        4,
        Math.min(innerWidth - button.offsetWidth - 6, container.right - button.offsetWidth - 6),
      );
      button.style.left = `${x}px`;
      button.style.top = `${Math.max(4, a.top + 3)}px`;
      region.style.left = `${Math.max(0, container.left)}px`;
      region.style.top = `${a.top}px`;
      region.style.width = `${Math.min(innerWidth, container.width)}px`;
      region.style.height = `${Math.max(a.height, bottom - a.top)}px`;
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(place);
  };
  const mutation = new MutationObserver((changes) => {
    if (
      changes.every(
        (c) =>
          c.target === host ||
          ([...c.addedNodes, ...c.removedNodes].every((n) => n === host) && c.type === "childList"),
      )
    )
      return;
    for (const e of entries)
      if (!e.anchor.isConnected || e.range.toString() !== e.original) e.invalidate();
    schedule();
  });
  mutation.observe(document.body, { childList: true, characterData: true, subtree: true });
  const resize = new ResizeObserver(schedule);
  resize.observe(document.documentElement);
  addEventListener("scroll", schedule, true);
  addEventListener("resize", schedule);
  place();
  world.__pagegradeCleanup = () => {
    cancelAnimationFrame(raf);
    mutation.disconnect();
    resize.disconnect();
    removeEventListener("scroll", schedule, true);
    removeEventListener("resize", schedule);
    host.remove();
    delete world.__pagegradeCleanup;
  };
}
