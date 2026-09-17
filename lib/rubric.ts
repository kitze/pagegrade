export const RUBRIC_VERSION = 1;
export const GRADES = ["A", "B", "C", "D", "E"] as const;
export type Grade = (typeof GRADES)[number];
export const COLORS: Record<Grade, string> = {
  A: "#087f5b",
  B: "#5b8c28",
  C: "#b58a0c",
  D: "#d37623",
  E: "#bc453c",
};
export const grade = (score: number): Grade =>
  score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";

export interface Metric {
  id: string;
  label: string;
  weight: number;
  question: string;
  levels: [string, string, string, string, string];
  fix: string;
}

export const SECTION_METRICS: Metric[] = [
  {
    id: "clarity",
    label: "Clarity",
    weight: 15,
    question: "Can the intended reader understand the main point without guessing?",
    levels: [
      "Meaning is obscured or contradictory.",
      "Main point requires substantial guessing.",
      "Understandable, with several ambiguous phrases.",
      "Clear point with only minor ambiguity.",
      "Immediately clear; terms and intent are unambiguous.",
    ],
    fix: "State the main point directly. Replace ambiguous phrases with concrete language.",
  },
  {
    id: "concision",
    label: "Concision",
    weight: 10,
    question:
      "Does the section earn its length without filler, repetition or unnecessary setup? Do not reward brevity that removes necessary detail.",
    levels: [
      "Mostly filler or repetition.",
      "Much could be removed without loss.",
      "Some padding; useful information remains.",
      "Mostly economical with adequate detail.",
      "Every part contributes; no meaningful padding.",
    ],
    fix: "Cut repeated ideas, throat-clearing and unnecessary qualifiers; keep essential detail.",
  },
  {
    id: "specificity",
    label: "Specificity",
    weight: 10,
    question:
      "Are claims and directions concrete enough for this section's purpose? Do not demand numbers when inappropriate.",
    levels: [
      "Only vague assertions.",
      "Mostly generic; little concrete information.",
      "Some useful specifics mixed with vague claims.",
      "Specific descriptions, examples or conditions where needed.",
      "Precisely scoped, concrete and useful throughout.",
    ],
    fix: "Replace generic claims with specific details, conditions or a relevant example.",
  },
  {
    id: "explanation",
    label: "Explanation",
    weight: 15,
    question:
      "Does it explain what the intended reader needs, including how or why when relevant? A short heading or product description need not be a tutorial.",
    levels: [
      "Essential explanation absent or internally misleading.",
      "Major reasoning or instruction gaps.",
      "Basic explanation; some leaps remain.",
      "Sound explanation with minor gaps.",
      "Complete, intuitive explanation for its role and audience.",
    ],
    fix: "Bridge missing steps. Explain unfamiliar terms and show how or why the claim works.",
  },
  {
    id: "usefulness",
    label: "Usefulness",
    weight: 15,
    question:
      "Does it answer a real reader question or help a decision or next step, appropriate to the page purpose?",
    levels: [
      "No discernible reader value.",
      "Low value; largely promotional or empty.",
      "Some useful answers but key needs remain.",
      "Useful answers or guidance for the reader.",
      "Directly resolves a reader need with practical value.",
    ],
    fix: "Answer the reader's likely question, then include the next detail needed to act or decide.",
  },
  {
    id: "readability",
    label: "Readability",
    weight: 10,
    question:
      "Is language and sentence complexity appropriate for the intended audience and language? Necessary technical vocabulary is not automatically bad.",
    levels: [
      "Very difficult to follow.",
      "Dense, tangled or needlessly technical.",
      "Readable with several difficult passages.",
      "Easy to follow for the intended audience.",
      "Effortless to read without sacrificing precision.",
    ],
    fix: "Split tangled sentences and explain jargon that this audience may not know.",
  },
  {
    id: "coherence",
    label: "Flow",
    weight: 8,
    question: "Do the section's sentences and ideas connect in a logical sequence?",
    levels: [
      "Disconnected or self-contradictory.",
      "Frequent jumps disrupt understanding.",
      "Mostly related ideas with uneven transitions.",
      "Logical order with minor rough spots.",
      "Each idea builds naturally on the previous one.",
    ],
    fix: "Order ideas from premise to explanation to conclusion; connect abrupt transitions.",
  },
  {
    id: "credibility",
    label: "Claim support",
    weight: 7,
    question:
      "Are claims appropriately qualified and supported within the supplied text? This is NOT external fact-checking. Ordinary descriptions do not require citations.",
    levels: [
      "Sweeping claims or guarantees with no support.",
      "Important claims ungrounded or overstated.",
      "Plausible, but important qualifications are missing.",
      "Claims mostly proportionate and supported when needed.",
      "Claims responsibly scoped with suitable evidence or qualifications.",
    ],
    fix: "Support consequential claims, name limits and remove unjustified absolutes.",
  },
  {
    id: "mechanics",
    label: "Writing quality",
    weight: 5,
    question:
      "Are grammar, spelling and terminology consistent in the text's language, allowing intentional voice and dialect?",
    levels: [
      "Errors regularly obscure meaning.",
      "Frequent distracting errors.",
      "Some noticeable errors or inconsistency.",
      "Polished with minor slips.",
      "Consistent, polished and mechanically sound.",
    ],
    fix: "Correct distracting errors and use consistent terminology, spelling and tense.",
  },
  {
    id: "intent",
    label: "Search intent",
    weight: 5,
    question:
      "Does this section deliver on its heading and the page's apparent topic without keyword stuffing? Judge relevance, not predicted search rank.",
    levels: [
      "Unrelated or misleading heading/content.",
      "Weak topic match or heavy keyword stuffing.",
      "Partly answers the heading or topic.",
      "Relevant and naturally phrased.",
      "Directly satisfies the heading/topic with natural, informative wording.",
    ],
    fix: "Align the heading and content with the reader's intent; remove forced keyword repetition.",
  },
];

export const PAGE_METRICS: Metric[] = [
  {
    id: "structure",
    label: "Section structure",
    weight: 30,
    question:
      "Are section count, boundaries, headings and order appropriate for this page's apparent purpose? No fixed ideal section count. Short single-purpose pages can need one section.",
    levels: [
      "Structure blocks comprehension.",
      "Major fragmentation or wall-of-text problems.",
      "Usable but uneven grouping or order.",
      "Well grouped and ordered with minor issues.",
      "Exactly the structure this content needs; headings guide the reader.",
    ],
    fix: "Group related ideas under useful headings. Merge fragments and split overloaded sections.",
  },
  {
    id: "length",
    label: "Length fit",
    weight: 25,
    question:
      "Does the page provide enough depth without overstaying its purpose? No minimum word count. A concise landing page and a long technical guide can both be excellent.",
    levels: [
      "Severely underdeveloped or overwhelmingly padded.",
      "Clearly too thin or too long for the purpose.",
      "Adequate depth with meaningful imbalance.",
      "Length mostly matches reader needs.",
      "Enough depth to fulfil the purpose; no unnecessary expansion.",
    ],
    fix: "Add missing decision-critical detail or remove material that does not serve the page's purpose.",
  },
  {
    id: "focus",
    label: "Focus & repetition",
    weight: 20,
    question:
      "Does each section add value rather than repeating other sections or drifting off topic?",
    levels: [
      "Mostly redundant or off topic.",
      "Major repetition or drift.",
      "Some repeated points or detours.",
      "Mostly focused and additive.",
      "Distinct, focused sections; repetition only when useful.",
    ],
    fix: "Merge overlapping sections and remove tangents; each section should add something new.",
  },
  {
    id: "completeness",
    label: "Purpose coverage",
    weight: 25,
    question:
      "Does the supplied page fulfil its apparent purpose and cover essential reader questions? Infer purpose from evidence; do not impose a sales-page template on an article or utility page.",
    levels: [
      "Fails its apparent purpose.",
      "Several essential questions unanswered.",
      "Covers the basics with notable omissions.",
      "Fulfils its purpose with minor omissions.",
      "Covers what readers need without irrelevant additions.",
    ],
    fix: "Identify unanswered reader questions and add only the missing information needed for this page.",
  },
];

export type Scores = Record<string, number>;
export function weighted(scores: Scores, metrics: Metric[]): number {
  return (
    metrics.reduce((total, m) => total + scores[m.id]! * m.weight, 0) /
    metrics.reduce((total, m) => total + m.weight, 0)
  );
}
export function sectionMean(sections: { words: number; score: number }[]): number {
  if (!sections.length) throw new Error("No sections scored.");
  // Square-root weighting balances substantive sections against tiny fragments;
  // cap prevents a single wall of text from dominating the page.
  const weights = sections.map((s) => Math.sqrt(Math.min(Math.max(s.words, 1), 500)));
  return (
    sections.reduce((sum, s, i) => sum + s.score * weights[i]!, 0) /
    weights.reduce((sum, w) => sum + w, 0)
  );
}
export function overallScore(section: number, page: number, seo: number): number {
  return Math.round(section * 0.7 + page * 0.2 + seo * 0.1);
}
