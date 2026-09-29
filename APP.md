# Running The Skynet Countdown

## Local development

Use a current Node.js LTS release (22.13+ or 24+) and npm.

```sh
npm ci
npm run dev
```

The site has a clock and history explorer, a searchable archive, individual incident reports and an interactive methodology page. Navigation uses hash URLs so direct links work on static hosts without server rewrite rules. Fonts are bundled locally; their OFL licences are in `public/fonts/`.

## Verify and build

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

`build` runs data validation before producing `dist/`. `test:e2e` starts a local production preview and exercises desktop/mobile navigation, archive filters, evidence details, history, the calculator, downloads and page widths. Browser screenshots and failure traces appear under `test-results/` (ignored by Git). If a compatible Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path.

`npm run preview` is for local review. No account, database, API key or active n8n connection is needed to run the site.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds and deploys on every push to `main`, including merged pull requests. It also supports **Actions → Deploy GitHub Pages → Run workflow** on `main`.

The build uses Node.js 24 and `npm ci`, then runs lint and `npm run build` (data validation, TypeScript checks and the Vite production build). A final check blocks deployment if `dist/index.html` is missing its `noindex` directive. Only `dist/` is uploaded to Pages. Deployment uses the built-in `GITHUB_TOKEN`; no additional secret is required. The build job has read permissions, and the deployment job has Pages write and OpenID Connect permissions.

The repository is already configured with **Settings → Pages → Build and deployment → Source: GitHub Actions** and the custom domain `skynetcountdown.org`. Once this workflow is committed and pushed to `main`, the first run publishes the site. Subsequent commits redeploy automatically. Deployment runs share a concurrency group so they cannot overlap. If copying this setup to a different repository, enable the GitHub Actions Pages source there first.

Vite's relative asset paths and the existing hash routes work on both the custom domain and the default repository Pages URL. Keep the domain configured in GitHub's Pages settings; this workflow does not hard-code it into the build.

### Search indexing

The shared `index.html` includes `<meta name="robots" content="noindex, nofollow">`, so crawlers receive the directive before JavaScript runs, including when following archive and methodology links. No blocking `robots.txt` is added: search engines must be able to crawl the page to see `noindex`. See [Google's robots meta tag guidance](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

This requests exclusion from search results; it does not make the site or downloadable files private. Search engines need to recrawl any previously indexed page before removing it.

## Append new records

1. Append rows to the existing CSVs, or replace them with complete exports containing the existing history plus new records. Preserve their filenames, headers and quoted CSV format. The app reads these files directly at build time.
2. Prefer a stable `event_id` in both exports. The stories CSV may also include `incident_date` and `source_url` together. With the original schema, a new globally unique CVE can join a report to an assessment only when the match is unambiguous.
3. Run `npm run validate:data`. Resolve every reported ambiguity or unexpected change before publishing.
4. Commit and push to `main`, or merge the update into `main`. GitHub Actions rebuilds and deploys the updated bundle. Local edits are not visible on the published site until deployed.

The existing exports reuse CVE IDs for unrelated stories. The audited import manifest in `src/lib/manifest.ts` assigns stable incident IDs, records explicit source/date aliases, selects assessment versions, and links original editorial reports. It retains all original variants while counting an event once. A new conflicting assessment requires an explicit review and manifest update; it never silently replaces or adds to the old score. Missing or changed audited content must be reviewed too.

Identical assessment copies are validated and then collapsed for reconciliation and display. The original rows remain in the downloadable CSV, and the validator reports both raw and distinct assessment counts. Changed scores, rationales or identity fields remain separate versions that require review. Each approved assessment content hash belongs to one reviewed event; an assessment can be approved without an accompanying editorial. Multiple URLs or publication dates for the same underlying event need explicit aliases in that event's manifest entry.

When explicit unique `event_id` values are supplied, legacy CVE labels may repeat: identity comes from `event_id`, not the old label. Without explicit IDs, a reused CVE on a new unrelated event stops validation.

### Review a correction without deleting history

For a revised assessment, retain the old row and append the correction. Add its full content hash to the manifest event's `assessmentContentFingerprints`, then set `selectedAssessmentContentFingerprint` to the approved version. This works even when the CVE, date, URL and total score are unchanged. `selectedAssessmentFingerprint` keeps the shared record identity.

Each editorial link specifies the exact `assessmentContentFingerprint` that the report describes. A rewritten report may retain the same CVE and headline: preserve both rows and add separate `storyContentFingerprint` entries, marking one link `preferred: true`. Executable examples of both review operations are in `src/lib/data-engine.test.ts`. The manifest is a reviewed record, so hashes are never refreshed automatically during a build.

Source/date matching detects repeated records; it cannot understand that two different articles cover the same development. Assign a shared reviewed event identity for those cases. Treat an intentionally new development reported at the same URL/date as an explicit identity decision.

The supplied n8n JSON is preserved. Before relying on unattended publishing, update that workflow to generate persistent unique event IDs, include them on both exports, and stop generating the authoritative clock position in the writer prompt. The app owns the calculation.

## Methodology

The method uses three binary Trifecta checks and five amplifiers worth zero to two points each. Count the active Trifecta checks and assign a combined base of 0, 1, 3 or 7 points for zero, one, two or three active checks. Add every amplifier point to that base. Published scores therefore range from 0 to 17. A complete Trifecta contributes seven points and is naturally at least CRITICAL; no separate floor or aggregate clamp is applied. Zero-score events remain visible and add nothing.

The published severity bands are:

| Published score | Severity |
| ---: | --- |
| 0 | NO MOVEMENT |
| 1–2 | CANARY |
| 3–4 | NOTABLE |
| 5–6 | SIGNIFICANT |
| 7–12 | CRITICAL |
| 13–17 | EXISTENTIAL |

T3 records permission and capability to affect external digital or physical systems without mandatory approval for each action. It does not automatically earn an autonomy amplifier point. Autonomy measures the extent, duration and scale of operation beyond meaningful human checkpoints:

| Autonomy score | Evidence anchor |
| ---: | --- |
| 0 | Bounded operation with effective human checkpoints, or insufficient evidence of extended autonomy |
| 1 | Extended multi-step or large-scale work with reactive or delayed oversight |
| 2 | Sustained self-directed operation or recursive improvement without meaningful review |

Future assessments must cite separate evidence and rationale for T3 and autonomy. The selected criterion values in the current dataset remain assessor judgements; the app applies the deterministic weighting to those recorded values.

The saved `n8n/Skynet Countdown.json` includes this distinction in the research and scoring prompts. It continues to collect binary checks, amplifier ratings and raw summary metadata in the existing export format; the website calculates the published score and severity. Import the saved workflow into n8n to apply its guidance to future collection runs.

For cumulative published evidence points `B`:

```text
symbolic seconds remaining = 3600 × 2^(-B / 100)
evidence pressure = 100 × (1 − 2^(-B / 100))
```

The fixed 100-point parameter halves the remaining symbolic time after every 100 evidence points. It is an editorial normalisation, not an empirically estimated risk parameter or a fit to a desired current reading. The curve approaches midnight without reaching it and cannot declare that human control has been lost. More coverage can increase the index even if underlying risk has not changed, so the selected sources and inclusion decisions matter.

The cumulative point total defines the clock position. The interface shows `<00:01` below one second. At extreme totals, stored seconds are limited to JavaScript's smallest positive number; this is a numeric representation limit. Per-event movement is calculated from the published score and proportional impact, so a positive event is still shown as moving less than one second, rather than as a zero-score event.

For an incident with a published score of `s`:

```text
share of remaining gap closed = 100 × (1 − 2^(-s / 100))
```

The same point score always closes the same proportion of the remaining gap. A two-point incident closes 1.38%; a 17-point incident closes 11.12%. Its movement in seconds depends on the clock position when it occurs because the remaining interval gets smaller over time. Incident impact should therefore be compared by score and share of gap closed, with seconds shown as the movement in historical context.

The clock changes with records, not wall time. There is no passive decay or positive-event recovery model. Published improvements can score zero; they do not subtract previous evidence. Formal corrective or recovery events would require a defined extension to the methodology.

History sorts events by incident date, then stable ID. Each displayed movement is the difference between the positions before and after that event. Late discoveries and explicit assessment changes recompute the history. The methodology version and dataset's latest incident date are visible in the app; the CSV export does not provide a collection timestamp.

The `total_score` and `classification` values reflect the workflow's unweighted export format. They, along with `clock_delta_minutes`, `severity_label`, `clock_delta_label` and `updated_clock_position`, are retained as automation metadata. The app derives published scores and severities from the eight criterion columns, then calculates the clock from those published scores.

## Current data snapshot

- 63 assessment rows, containing 51 distinct assessments grouped into 40 events.
- 38 editorial reports cover 32 events; eight events have no editorial copy.
- 113 published evidence points derived from the selected criterion values.
- 27:25 symbolic minutes remaining; 54.3/100 evidence pressure.
- Latest recorded event: 28 September 2026.

Historical conflicting assessments use explicitly reviewed, conservative selections. Original editorial text remains available and is labelled when written for a different assessment version. Machine citation markers are removed from display; original source links and raw downloadable CSVs are preserved.

The supplied stories are automated workflow outputs, not independently verified by this app. Readers can inspect the source and disagree with the analysis. The frontend adds no invented incidents or replacement news copy.

## Main files

- `src/lib/`: CSV validation, identity reconciliation, scoring, calibration and regression tests.
- `src/data.ts`: imports the two source files.
- `src/components/`: shared clock, history and editorial components.
- `src/pages/`: home, archive, report and methodology views.
- `src/styles.css`, `src/pages/methodology.css`: the visual system documented in `DESIGN.md`.
- `tests/app.spec.ts`: production-browser checks.
