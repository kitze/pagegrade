// Self-contained: Chrome serializes this function into the isolated world.
export function extractPage() {
  const root =
    document.querySelector("main, [role='main']") ??
    document.querySelector("article") ??
    document.body;
  const hidden = (el: Element) => {
    const style = getComputedStyle(el);
    return (
      el.hasAttribute("hidden") ||
      el.getAttribute("aria-hidden") === "true" ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    );
  };
  const excluded =
    "script,style,noscript,template,svg,canvas,iframe,nav,footer,aside,form,input,textarea,select,button,[contenteditable]:not([contenteditable='false']),[role='navigation'],[role='dialog'],[role='banner'],[data-pagegrade-ui]";
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  // Invalid page lang attributes must not break extraction.
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(document.documentElement.lang || undefined, {
      granularity: "word",
    });
  } catch {
    segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  }
  const wordCount = (text: string) =>
    [...segmenter.segment(text)].filter((part) => part.isWordLike).length;
  const headingText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element) || hidden(node) || node.matches(excluded)) return "";
    return Array.from(node.childNodes, headingText).join(" ");
  };
  const selector = (el: Element): string => {
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.documentElement) {
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const tag = current.tagName.toLowerCase();
      const index = current.parentElement
        ? Array.from(current.parentElement.children)
            .filter((s) => s.tagName === current!.tagName)
            .indexOf(current) + 1
        : 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = current.parentElement;
    }
    return parts.join(" > ");
  };
  const groups: { title: string; parts: string[]; selector: string }[] = [];
  let current = { title: "Introduction", parts: [] as string[], selector: selector(root) };
  const flush = () => {
    if (normalize(current.parts.join(" "))) groups.push(current);
  };
  const headingLevels: number[] = [];
  let visited = 0;
  let walkLimited = false;
  const visit = (node: Node) => {
    if (++visited > 100_000) {
      walkLimited = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalize(node.textContent ?? "");
      if (text) current.parts.push(text);
      return;
    }
    if (!(node instanceof Element) || node.matches(excluded) || hidden(node)) return;
    if (/^H[1-6]$/.test(node.tagName)) {
      headingLevels.push(Number(node.tagName[1]));
      const title = normalize(headingText(node));
      if (title) {
        flush();
        current = { title: title.slice(0, 240), parts: [], selector: selector(node) };
      }
      return;
    }
    if (node !== root && node.matches("section,article") && current.parts.length) {
      flush();
      current = {
        title: node.getAttribute("aria-label")?.slice(0, 240) || "Section",
        parts: [],
        selector: selector(node),
      };
    }
    for (const child of node.childNodes) {
      if (walkLimited) break;
      visit(child);
    }
  };
  // Exclusion/visibility may be inherited from outside the chosen main element.
  let ancestor: Element | null = root;
  let rootExcluded = false;
  while (ancestor) {
    if (hidden(ancestor) || ancestor.matches(excluded)) rootExcluded = true;
    ancestor = ancestor.parentElement;
  }
  if (!rootExcluded) visit(root);
  flush();
  let remaining = 60_000;
  const sections: {
    id: string;
    title: string;
    text: string;
    words: number;
    selector: string;
    clipped: boolean;
  }[] = [];
  let totalWords = 0;
  let totalChars = 0;
  let includedChars = 0;
  for (const [i, group] of groups.entries()) {
    const full = normalize(group.parts.join(" "));
    const words = wordCount(full);
    totalWords += words;
    totalChars += full.length;
    if (i >= 40 || remaining <= 0) continue;
    const text = full.slice(0, Math.min(6000, remaining));
    remaining -= text.length;
    includedChars += text.length;
    sections.push({
      id: `s${i + 1}`,
      title: group.title === "Section" ? `Section ${i + 1}` : group.title,
      text,
      words,
      selector: group.selector,
      clipped: text.length !== full.length,
    });
  }
  const images = [...root.querySelectorAll("img")].filter((img) => {
    let parent: Element | null = img;
    while (parent && parent !== root) {
      if (hidden(parent) || parent.matches(excluded)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
  const description =
    document.querySelector('meta[name="description" i]')?.getAttribute("content")?.trim() ?? "";
  return {
    url: location.href,
    title: document.title.slice(0, 500),
    language: document.documentElement.lang.slice(0, 80),
    description: description.slice(0, 1000),
    sections,
    totalSections: groups.length,
    totalWords,
    totalChars,
    includedChars,
    walkLimited,
    partial: walkLimited || sections.length !== groups.length || sections.some((s) => s.clipped),
    seo: {
      titleLength: document.title.trim().length,
      descriptionLength: description.length,
      h1Count: headingLevels.filter((h) => h === 1).length,
      headingSkips: headingLevels.some((h, i) => i > 0 && h > headingLevels[i - 1]! + 1),
      images: images.length,
      missingAlt: images.filter((img) => !img.hasAttribute("alt")).length,
      hasLang: !!document.documentElement.lang.trim(),
    },
  };
}

export type Snapshot = ReturnType<typeof extractPage>;
export type Section = Snapshot["sections"][number];

// Restores exactly the original inline outline after the brief focus indicator.
export function focusSection(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const props = ["outline", "outline-offset"];
  const before = props.map((p) => [
    p,
    el.style.getPropertyValue(p),
    el.style.getPropertyPriority(p),
  ]);
  el.style.setProperty("outline", "3px solid #087f5b", "important");
  el.style.setProperty("outline-offset", "6px", "important");
  setTimeout(() => {
    for (const [p, value, priority] of before) {
      if (value) el.style.setProperty(p!, value, priority);
      else el.style.removeProperty(p!);
    }
  }, 1800);
  return true;
}
