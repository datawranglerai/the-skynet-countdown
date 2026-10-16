# Running The Skynet Countdown

## Architecture

The Vite/React frontend runs on GitHub Pages. It fetches `https://api.skynetcountdown.org/dataset` from a small Node.js API on Railway. The API reads Neon PostgreSQL and applies the same scoring and clock calculation used in the tests. Data updates appear on page load, window focus and every 60 seconds while the tab is visible. API snapshots are cached in memory for up to 30 seconds.

`assessments` and `stories` remain the current n8n records. `events` stores their grouping, stable route slugs, public SKYNET IDs and canonical selections. `record_history` preserves previous versions and the assessment version each report describes. New source records receive an event automatically; updates to a selected source advance its published assessment while retaining history. `event_parents` groups duplicate events without rewriting their original records. `event_identity_decisions` records automated classifications, reviews and undo actions.

The files in `data/` and `src/lib/manifest.ts` are migration evidence and test fixtures. The production browser bundle does not import them or fall back to them when the API is unavailable.

Incident pages show the selected current assessment and editorial. Earlier versions remain in the database, API and CSV history exports. An optional `recordSummary` supplies the earliest stored assessment capture time, its weighted initial score and the latest record update time. The API derives these three fields from the history and event metadata it already reads and caches, with no extra SQL queries or migration. "First recorded" is a capture date, which can be the import date for archived records; it is not the incident's occurrence or publication date. Routine API refreshes do not change it. Deploy both the API and frontend to show the note; older API responses remain supported and simply omit it.

## Local development

Use Node.js 24 LTS and npm:

```sh
npm ci
npm run dev:api
```

In another terminal:

```sh
VITE_API_URL=http://127.0.0.1:3000/dataset npm run dev
```

The API reads `DATABASE_URL` from the local ignored `.env` file. The browser receives only the public API URL. `.env.example` documents the settings without credentials. For normal API use, prefer a SELECT-only database account; database migration needs a separate owner connection.

The app keeps its last successfully loaded dataset if a refresh fails and displays a stale-data notice. An initial failure shows a retry screen. It never invents a clock reading from bundled fallback data.

## Verify and build

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit and browser tests use local fixtures and mocked API responses. They require no production database or secrets. `build` checks TypeScript and produces the static frontend in `dist/`. `npm run validate:data` remains available to validate the archived CSV migration inputs.

Browser screenshots and failure traces appear under `test-results/` (ignored by Git). If a compatible Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path.

## Railway API deployment

Create a Railway service from this repository and connect its deployment branch. For the first rollout, a feature branch lets you verify the API before merging the frontend into `main`; subsequent deployments can follow `main`. Keep the service root at the repository root. Railway detects the `Dockerfile`, which installs production dependencies and runs `node server/index.ts` on Node.js 24. The server listens on `0.0.0.0` and Railway's `PORT`. No build-time database connection is needed.

Configure the service:

| Setting | Value |
| --- | --- |
| `DATABASE_URL` | Neon connection for a SELECT-only API account; store it as a sealed Railway variable |
| `CORS_ORIGINS` | `https://skynetcountdown.org,https://www.skynetcountdown.org` |
| Healthcheck path | `/health` |
| Healthcheck timeout | 60 seconds |
| Custom domain | `api.skynetcountdown.org` |

The Dockerfile supplies the start command. Leave the pre-deploy command empty: migrations are deliberate one-off operations and are never run by API startup or a frontend deployment. Use Railway's dashboard settings; its older `railway.toml`/`railway.json` config is deprecated. [Railway configuration documentation](https://docs.railway.com/config-as-code/reference)

After migration, `npm run db:create-api-role` creates a SELECT-only `skynet_api_reader` account and writes its private connection settings to `.env.railway.local` with owner-only file permissions. Copy those values into the Railway service variables. This file is ignored by Git and excluded from the Docker image. Keep the owner connection in the local `.env` for deliberate migration operations. The command refuses to overwrite an existing role or credential file; reuse the existing settings on subsequent deployments.

Add the CNAME and ownership-verification records Railway displays for `api.skynetcountdown.org`. Railway provisions HTTPS. Verify `/health` returns `{"status":"ok"}` and `/dataset` returns the incident dataset before publishing the frontend change. Code changes redeploy the service through Railway's GitHub integration; new database rows need no deployment.

API routes:

- `GET /dataset`: complete, validated public dataset with calculated clock values.
- `GET /exports/assessments.csv`: assessment history and provenance references.
- `GET /exports/stories.csv`: story history and exact assessment-version links.
- `GET /health`: readiness, including the ability to read a valid dataset.

The API supports GET/HEAD and CORS preflight only. It has no write endpoints. Database credentials and errors are never returned to the browser. Remote PostgreSQL connections verify TLS certificates and enable channel binding.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds and deploys on every push to `main`, including merged pull requests. It also supports **Actions → Deploy GitHub Pages → Run workflow** on `main`.

The workflow uses Node.js 24, installs dependencies, runs lint and tests, and builds the static frontend with `VITE_API_URL=https://api.skynetcountdown.org/dataset`. It never receives `DATABASE_URL` or accesses production PostgreSQL. Only `dist/` is uploaded to Pages. The existing custom domain remains `skynetcountdown.org` and navigation retains hash URLs.

### Search indexing

`index.html` includes `<meta name="robots" content="noindex, nofollow">`. A deployment check verifies the directive is present in the built HTML. API responses also include `X-Robots-Tag: noindex, nofollow`. These directives request exclusion from search results; they do not make the site or records private.

## Analytics

The frontend loads GoatCounter's official `https://gc.zgo.at/count.js` script and sends pageviews and native events to `https://skynetcountdown.goatcounter.com/count`. Reports are available in the [GoatCounter dashboard](https://skynetcountdown.goatcounter.com/). No API key, Railway change or build secret is required.

[src/analytics.ts](src/analytics.ts) enables tracking only in production builds served at `skynetcountdown.org` or `www.skynetcountdown.org`. Local development, local previews and other hostnames do not load the script. Do Not Track also prevents loading; the native client's `skipgc` opt-out remains supported. Script failures or blockers leave the site usable.

Pageviews use the site's actual hash routes: `/`, `/#/incidents`, `/#/methodology` and `/#/incidents/<canonical-event-id>`. The Event Horizon section belongs to the methodology page. Automatic GoatCounter pageviews are disabled so they cannot duplicate the app's counts. Data refreshes and alias redirects do not add pageviews; returning to a page through navigation does. Page titles are captured after the route resolves, and a short bounded queue handles a slow-loading analytics script.

| Event path | Interaction |
| --- | --- |
| `click/<area>/<destination>` | Links in the header, clock, timeline, recent incidents, archive, incident report, methodology and footer. Includes report opens, original sources, GitHub, contributions, donations, image credits and CSV downloads. |
| `archive/severity/<value>`, `archive/sort/<value>`, `archive/leading/on` or `off` | Archive filter and sort changes. |
| `timeline/explore` | First change to the selected timeline incident during a visit to the clock. |
| `methodology/worked-example` | Selecting an assessment in the worked examples. |
| `calculator/use`, `calculator/phase/<phase>`, `calculator/reset` | First calculator use during a methodology visit, phase switches and resets. |
| `soundtrack/on`, `soundtrack/off` | Requests to enable or disable the soundtrack; these count toggle actions, not successful playback. |

For example, `click/footer/github.com/datawranglerai/skynet-countdown-scoring-methodology` identifies the footer's repository link, while `click/archive/incidents/<event-id>` identifies an archive report link. Titles give each event a readable label; the referrer identifies the page where it happened. Events use `event: true` and `no_session: true` so repeat interactions are counted separately from pageviews. Keyboard activation and middle-click links are covered. A download event records the click, not proof that the transfer completed.

The integration does not send search text, calculator inputs, outbound query strings or outbound fragments. It adds no cookies or custom visitor identifiers. Existing links are tracked through delegation, so newly fetched incidents need no separate analytics wiring. Add `data-analytics-area` to a container to distinguish a new group of links, or call `trackEvent()` for a deliberate non-link interaction. Avoid calling it from renders or data refreshes.

Browser analytics tests intercept the script and dataset while serving the local build under the production hostname. They send nothing to the live counter. See GoatCounter's [SPA integration](https://www.goatcounter.com/help/spa), [JavaScript API](https://www.goatcounter.com/help/js) and [native events](https://www.goatcounter.com/help/events) documentation for the underlying API.

## Migrating the archived CSV records

The importer uses the reviewed manifest to preserve incident grouping, selected assessments and old report URLs. It retains existing PostgreSQL row identities and database-authored story rewrites. Exact source URLs determine current assessment rows; `stories.assessment_id` determines their parent. Upstream `cve_id` values are retained as metadata and never used as database join keys.

```sh
# Inspect the planned migration without writing.
npm run db:migrate

# Apply the reviewed migration with the owner connection in .env.
npm run db:migrate -- --apply

# Independently read and validate the resulting database.
npm run db:check
```

Back up the database before applying a migration. Schema and data changes run transactionally, preserve historical versions and are checked before commit. Re-running the same import must preserve later live updates and must not reset event selections. CSV imports are a bootstrap operation; the normal publishing path is n8n → PostgreSQL → API.

For the initial migration, verify all 63 CSV assessment rows are accounted for, all 38 CSV stories and eight database rewrites remain recoverable, and all current source rows have an event. The reviewed historical clock baseline is 40 events, 113 points and 14:01 under the current approach calibration. Preserve the existing event slugs when assigning permanent `SKYNET-YYYY-NNNN` display IDs.

For the PostgreSQL checks, set `TEST_DATABASE_URL` to a migrated local copy named `skynet_test` and run `npm run test:postgres`. The separate migration integration test creates and drops its own temporary database, verifies a forced rollback, imports representative existing records, checks all historical version links and tests reruns after new live data. To run just that self-contained rehearsal against an empty local `skynet_test` database, use `node --experimental-strip-types --test server/migration.integration.test.ts`. These tests refuse remote database hosts.

## Updating live data

Continue writing the existing `assessments` and `stories` tables from n8n, omitting identity `id` on inserts. Upsert assessments by `source_url`, use their returned database `id` for `stories.assessment_id`, and upsert stories by that foreign key. Database triggers update timestamps, preserve previous versions and maintain event selections. Prefer writing an assessment and its corresponding story in one transaction.

The database can group another source under an existing event when its assessment is inserted with that `event_id`. The saved n8n v1.1/v1.2 mappings and assessment upserts omit this field. The companion [Reconcile Events workflow](<n8n/Skynet Countdown - Reconcile Events.json>) instead checks persisted events on a schedule, covering existing and future duplicates. Very confident same-occurrence matches passing the evidence and date checks are grouped automatically; uncertain pairs enter a database review queue. A new URL alone cannot prove that an incident is new.

Deploy the API/frontend grouping support, apply [migration 002](db/002_event_reconciliation.sql), then configure and activate the companion workflow. The API supports the pre-002 schema during rollout. It resolves event parents within its read-only snapshot, retains the root's selected score, combines all source history and exposes old slugs as aliases. Review and undo use guarded database functions; there is no public merge endpoint. [N8N_DEDUPLICATION.md](N8N_DEDUPLICATION.md) contains the full import, permissions, first-run, review and undo walkthrough. The database-specific tests include the reconciliation integration test.

Published scores and clock positions are computed from the eight criteria. Writer-supplied score labels and clock text remain source metadata.

## Methodology

[METHODOLOGY.md](METHODOLOGY.md) is the full description of methodology v1.0 and its maintainer handoff. This section records the operational rules that the API, database workflow and frontend must implement.

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

The saved n8n workflow exports include this distinction in the research and scoring prompts. `n8n/Skynet Countdown v1.1.json` contains the PostgreSQL upserts; its approved T3/autonomy guidance is aligned with the original export. The workflow collects binary checks, amplifier ratings and raw summary metadata; the API calculates the published score and severity. Import the chosen saved workflow into n8n to apply its guidance to future collection runs.

Before Event Horizon, for cumulative published evidence points `B`:

```text
symbolic seconds remaining = 120 + 780 × 2^(-B / 1000)
evidence pressure = 100 × (900 − remaining seconds) / 900
```

Methodology v1.0, calibration effective 11 October 2026, starts with 900 symbolic seconds. The starting window borrows the [15-minute reading published by IMD's AI Safety Clock in September 2026](https://www.imd.org/ibyimd/artificial-intelligence/imd-ai-safety-clock-moves-to-15-minutes-to-midnight/) as a dated, attributable editorial reference. IMD's reading is itself an editorial judgement. It sets this project's watch once: from the first incident onward, the selected evidence, scores, formula and historical movements are this project's own and do not remain synchronised with IMD. The projects are unaffiliated.

The fixed 1,000-point parameter halves the gap above 120 seconds: 15:00 becomes 08:30, then 05:15. It applies to the complete approach history and all future incidents in that phase. The clock remains strictly above 02:00 until a separate, explicit editorial decision authorises Event Horizon. Incidents continue moving it in ever smaller increments; there is no waiting queue or numerical trigger. More coverage can increase the index even if underlying risk has not changed, so the selected sources and inclusion decisions matter.

The API and frontend both import the shared calibration code, so deploy the Railway service and the GitHub Pages frontend together when this constant changes. Clock values are calculated from the selected records whenever the dataset is read; the PostgreSQL rows do not store the authoritative clock ledger, so this recalibration needs no database backfill.

After approval, only post-boundary incidents with published scores of at least 10 contribute. If `E` is the sum of those eligible scores, `T = 120 × 2^(-E / 250)`. Lower-scoring records stay visible. The 250-point half-scale is fixed and separately documented; earlier incidents are not processed again under the new scale. `totalPoints` and per-incident `cumulativePoints` retain all published scores, while `clock.phasePoints`, `phaseCumulativePoints` and `effectivePoints` record the points used for movement.

Near the boundary, the approach readout shows `>02:00`, preserving the distinction between approaching and entering it. After entry, the interface shows `<00:01` below one second. Numeric representation floors preserve a positive distance and eligible movement at extreme totals. The phase marker at 86.67% of the dial refers to the 15-minute display window; it is not a percentage of control lost.

For an incident with a published score of `s`:

```text
share of remaining gap closed = 100 × (1 − 2^(-s / 1000))
```

Within the approach phase, a two-point incident closes 0.14% of the gap to Event Horizon; a 17-point incident closes 1.17%. Inside Event Horizon, use 250 as the denominator, with a zero share for scores below ten. A qualifying ten-point incident closes 2.73% of the gap to midnight. Scores remain comparable across phases, while proportional impact and seconds must be interpreted under the labelled phase.

The clock changes with records, not wall time. There is no passive decay or positive-event recovery model. Published improvements can score zero; they do not subtract previous evidence. With selected assessments held fixed, added events have non-negative scores and cannot move the clock away from midnight. Corrections to selected assessments or explicit canonical regrouping can reduce the cumulative score and recalculate history backwards. Scored recovery events would require a defined extension to the methodology.

History sorts events by incident date, then stable ID. Incident movement excludes the separately labelled adjustment that enters Event Horizon at 02:00. Late discoveries and explicit assessment changes recompute their appropriate phase. The methodology version, latest incident date and database update timestamp are visible in the app.

The `total_score` and `classification` values reflect the workflow's unweighted export format. They, along with `clock_delta_minutes`, `severity_label`, `clock_delta_label` and `updated_clock_position`, are retained as automation metadata. The app derives published scores and severities from the eight criterion columns, then calculates the clock from those published scores.

## Authorising Event Horizon

The current value of `EVENT_HORIZON_APPROVAL` in [src/lib/event-horizon.ts](src/lib/event-horizon.ts) is `null`. Keep it that way until the owner makes the explicit editorial judgement. Neither the public site, a calculator preview, a score, a timestamp nor n8n can activate it.

To authorise entry deliberately:

1. Publish an editorial explaining the evidence for a material deterioration in meaningful human control, including the uncertainty and reasons for the decision.
2. Identify the last incident that belongs to the approach phase. Record its stable route ID and selected assessment date from the API. These form the frozen `effectiveAfter` key; that incident itself is not counted again after entry.
3. Replace the null approval with an `EventHorizonApproval` containing `approvedBy`, `approvedAt` (UTC ISO timestamp), `effectiveAfter: { date, incidentId }`, `rationale` and `editorialUrl`. Use the actual published editorial URL and actual approval details. This repository change is the deliberate activation operation.
4. Run tests, lint, build and `npm run db:check` against the intended live data. Inspect the transition adjustment, which places the clock at exactly 02:00 separately from incident movement. If the selected anchor is missing or its date has changed, resolve that discrepancy explicitly before deployment.
5. Deploy the API and frontend. The API publishes the decision metadata with the clock; the site shows the phase and editorial link. There is no database backfill or schema migration for activation.

The chronology key is date followed by route ID. Later-discovered records before that key remain in the approach phase. Later records after it use the ten-point threshold individually; several smaller scores never combine into an eligible incident. A preserved route alias can identify a merged anchor, but its date must still match. Every selected event contributes at most once. A correction can recompute its movement; a changed anchor date requires a renewed editorial decision rather than silently moving the boundary.

The pure ledger and archived fixtures default to an unapproved approach phase. Production API startup and the live database check explicitly load the approval policy. This keeps frozen migration rehearsals usable after a future live approval.

To revoke a mistaken entry, publish the correction, record the reason in the repository history and return the approval to `null`. The clock then recalculates the approach history from the preserved records. This corrects the editorial judgement; it does not introduce negative-scoring safety news or automatic recovery.

During deployment, the frontend can read an older API payload by recalculating its selected scores under the unapproved approach rule. New payloads carry explicit phase and approval metadata that must agree with the ledger. Deploy both services together for a new approval; the browser cannot authorise one locally.

## CSV migration baseline

- 63 assessment rows, containing 51 distinct assessments grouped into 40 events.
- 38 editorial reports cover 32 events; eight events have no editorial copy.
- 113 published evidence points derived from the selected criterion values.
- 14:01 symbolic minutes remaining; 6.5/100 evidence pressure.
- Latest recorded event: 28 September 2026.

Historical conflicting assessments use explicitly reviewed, conservative selections. Original editorial text remains available and is labelled when written for a different assessment version. Machine citation markers are removed from display; original source links and raw downloadable CSVs are preserved.

The supplied stories are automated workflow outputs, not independently verified by this app. Readers can inspect the source and disagree with the analysis. The frontend adds no invented incidents or replacement news copy.

## Main files

- `src/lib/`: shared scoring/calibration, API response validation and archived CSV import tests.
- `src/data.ts`: fetches the live API dataset.
- `server/`: Railway HTTP API, PostgreSQL snapshot reader and data adapter.
- `db/`, `scripts/migrate-postgres.ts`: ingress schema, history/grouping migration and CSV import.
- `scripts/check-postgres.ts`: read-only database validation.
- `src/components/`: shared clock, history and editorial components.
- `src/pages/`: home, archive, report and methodology views.
- `src/styles.css`, `src/pages/methodology.css`: the visual system documented in `DESIGN.md`.
- `tests/app.spec.ts`: production-browser checks.
- `METHODOLOGY.md`: full methodology v1.0 specification and maintainer handoff.
- `README.md`: public project overview and concise methodology summary.
- `APP.md`: operational development, data, migration and deployment rules.
- `DESIGN.md`: interface and content presentation contract.
