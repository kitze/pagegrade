import type { Snapshot, Section } from "./extract";
import { evaluate, sectionRequest } from "./jev";
import { SECTION_METRICS, type Scores } from "./rubric";

export const CHUNK_SIZE = 6000;
export function splitSection(text: string): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > CHUNK_SIZE) {
    const boundary = rest.lastIndexOf(" ", CHUNK_SIZE);
    const end = boundary > CHUNK_SIZE / 2 ? boundary : CHUNK_SIZE;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
export function mergeChunks(results: { scores: Scores; length: number }[]): Scores {
  const size = results.reduce((n, r) => n + r.length, 0);
  if (!size) throw new Error("No section text.");
  return Object.fromEntries(
    SECTION_METRICS.map((m) => [
      m.id,
      results.reduce((n, r) => n + r.scores[m.id]! * r.length, 0) / size,
    ]),
  );
}
export async function evaluateSection(
  page: Snapshot,
  section: Section,
  key: string,
  signal: AbortSignal,
) {
  const chunks = splitSection(section.text);
  const results: { scores: Scores; length: number }[] = [];
  for (const [index, text] of chunks.entries()) {
    const request = sectionRequest(page, section);
    request.state.section.text = text;
    const state = {
      ...request.state,
      chunk: {
        index: index + 1,
        total: chunks.length,
        note: "Judge this passage only. Do not penalize missing setup or conclusion supplied in other chunks. Flow and intent are passage-level, not proof of whole-section coherence.",
      },
    };
    const scores = await evaluate({ ...request, state }, SECTION_METRICS, key, signal);
    results.push({ scores, length: text.length });
  }
  return { scores: mergeChunks(results), chunks: chunks.length };
}
export const canAssessPage = (page: Snapshot) => !page.partial && page.totalChars <= 60_000;
