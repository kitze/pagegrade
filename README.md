# PageGrade

A WXT Chrome extension that grades readable page sections with [TypeSafe AI Jev](https://docs.typesafe.ai/) through Vercel AI Gateway. Each section gets ten rubric scores; the page gets an A–E grade and a breakdown you can inspect.

MIT licensed. Bring your own Vercel AI Gateway key. No backend or analytics.

## Install locally

Requires Bun and Chrome 120+ (Manifest V3).

```sh
bun install --frozen-lockfile
bun run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3` inside this checkout.
3. Open a normal web page and click PageGrade's toolbar icon. A report tab opens.
4. Save your **Vercel AI Gateway** API key under **Connection**. Gateway credits and Jev access may be required.
5. Click **Analyze page** to consent to sending that page's extracted content for evaluation.

Browse section grades, expand metrics for their rubrics, use **Locate on page**, or **Export JSON**. **Cancel analysis** stops outstanding requests. **Clear** removes the report. Navigation or closing the source tab clears its report. Click the extension again after navigating to grant access to the new page.

`bun run zip` creates the unpacked archive under `.output/`. This is not a Chrome Web Store listing or a signed CRX.

## Scoring v1

Jev answers typed `score` questions with five explicit ordered anchors. Fractional scores are valid: normalize its **0–4** result to **0–100** by multiplying by 25. These values are rubric positions, not confidence probabilities.

### Per-section metrics

| Metric          | Weight |
| --------------- | -----: |
| Clarity         |    15% |
| Concision       |    10% |
| Specificity     |    10% |
| Explanation     |    15% |
| Usefulness      |    15% |
| Readability     |    10% |
| Flow            |     8% |
| Claim support   |     7% |
| Writing quality |     5% |
| Search intent   |     5% |

Exact questions, all five anchors, and fixed improvement guidance live in [`lib/rubric.ts`](lib/rubric.ts). Jev does not generate rewrites or free-form advice.

### Whole-page score

```text
sectionQuality = weighted mean of section scores
section weight = sqrt(min(max(wordCount, 1), 500))

composition = 30% section structure
            + 25% length fit
            + 20% focus / non-repetition
            + 25% purpose coverage

overall = round(70% sectionQuality + 20% composition + 10% onPageChecks)
```

Length and section count are judged against the page's apparent purpose. No minimum word count, no universal ideal section count, no reward for padding. A brief landing page and a long guide can both score well. Capped square-root weighting prevents both tiny fragments and one huge section from dominating.

Local on-page checks equally weight title presence, description presence, H1 convention, heading hierarchy, image alt-attribute presence and document-language presence. They do **not** claim to predict search rankings. Empty image alt is allowed for decorative images; meaningful alternative text is not evaluated.

| Grade | Score  | Color       |
| ----- | ------ | ----------- |
| A     | 85–100 | Dark green  |
| B     | 70–84  | Light green |
| C     | 55–69  | Yellow      |
| D     | 40–54  | Orange      |
| E     | 0–39   | Red         |

Editorial heuristic only. Not an official Nutri-Score, fact-check, comprehensive SEO audit, accessibility audit or ranking prediction. No affiliation with Nutri-Score. The rubric is not calibrated against human ratings yet. Scores may vary between runs.

## Extraction and limits

- Reads the first `main` / `[role=main]`, otherwise the first `article`, otherwise `body`.
- Uses headings and semantic section boundaries, without counting nested text twice.
- Excludes navigation, footers, sidebars, forms, editable fields, controls, hidden content, scripts and iframes.
- Does not inspect images/video meaning, canvas, shadow DOM or unloaded content.
- At most **40 sections**, **6,000 characters per section**, **60,000 total characters**, and **100,000 visited DOM nodes**.
- Clipped/omitted content produces an explicit **sample grade**, never an unqualified full-page grade. Coverage describes extracted text, not content that the extractor cannot see.
- Two concurrent section requests, then one page-composition request. One active page analysis globally. No automatic retries or background scanning.
- Every required answer must be present, correctly typed, finite and in range. Any failed request means **no final grade**. No fabricated fallback scores.
- Page changes during analysis invalidate the result. A browser worker restart shows an interrupted-run error rather than leaving a permanent spinner.

## Privacy and security

- **Click-to-analyze only.** Opening a report extracts locally; network evaluation starts only after clicking Analyze.
- Sends extracted main-page text, section headings, page title, description and language to **Vercel AI Gateway**, which routes to **TypeSafe AI Jev**. Do not analyze sensitive pages. Provider retention policies apply; this project does not promise zero retention.
- Does not send the source URL, query string, DOM selectors, form values or browser history to the model. Text and metadata themselves can still contain sensitive information.
- API key stays in extension-local storage restricted to trusted extension contexts. It is **not encrypted**, synced, bundled or sent to source pages. Remove it under Connection.
- Scores, headings and source origin are held in browser **session** storage, cleared on source navigation/close, browser exit or Clear. Extracted source text is not persisted in reports.
- Exported JSON includes scores, headings and source origin; review before sharing.
- Permissions: `activeTab`, `scripting`, `storage`, and access to `https://ai-gateway.vercel.sh/*`. No persistent all-sites permission, external messaging or remote code.
- Page content is treated as untrusted evidence in all model questions. Model output never runs code, follows links or changes page content. Locate only briefly highlights the selected section.

## Development

```sh
bun run check   # TypeScript, lint, focused tests, formatting
bun run build
bun run zip
```

Run the optional live API smoke with a key supplied through your shell environment:

```sh
bun scripts/smoke-jev.ts
```

The smoke sends only a hardcoded synthetic basil-growing guide. It requires `AI_GATEWAY_API_KEY` and prints metrics/counts, never the credential. `SMOKE_REPORT_PATH` optionally writes its synthetic report locally.

No GitHub Actions are configured. No production secrets or real-page fixtures belong in this repository.
