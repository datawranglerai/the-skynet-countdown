# Running The Skynet Countdown

## Architecture

The Vite/React frontend runs on GitHub Pages. It fetches `https://api.skynetcountdown.org/dataset` from a small Node.js API on Railway. The API reads Neon PostgreSQL and applies the same scoring and clock calculation used in the tests. Data updates appear on page load, window focus and every 60 seconds while the tab is visible. API snapshots are cached in memory for up to 30 seconds.

`assessments` and `stories` remain the current n8n records. `events` stores their reviewed grouping, stable route slugs, public SKYNET IDs and canonical selections. `record_history` preserves previous versions and the assessment version each report describes. New source records receive an event automatically; updates to a selected source advance its published assessment while retaining history. Different articles about one incident still require an explicit shared event identity.

The files in `data/` and `src/lib/manifest.ts` are migration evidence and test fixtures. The production browser bundle does not import them or fall back to them when the API is unavailable.

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

For the initial migration, verify all 63 CSV assessment rows are accounted for, all 38 CSV stories and eight database rewrites remain recoverable, and all current source rows have an event. The reviewed historical clock baseline is 40 events, 113 points and 27:25. Preserve the existing event slugs when assigning permanent `SKYNET-YYYY-NNNN` display IDs.

For the PostgreSQL checks, set `TEST_DATABASE_URL` to a migrated local copy named `skynet_test` and run `npm run test:postgres`. The separate migration integration test creates and drops its own temporary database, verifies a forced rollback, imports representative existing records, checks all historical version links and tests reruns after new live data. To run just that self-contained rehearsal against an empty local `skynet_test` database, use `node --experimental-strip-types --test server/migration.integration.test.ts`. These tests refuse remote database hosts.

## Updating live data

Continue writing the existing `assessments` and `stories` tables from n8n, omitting identity `id` on inserts. Upsert assessments by `source_url`, use their returned database `id` for `stories.assessment_id`, and upsert stories by that foreign key. Database triggers update timestamps, preserve previous versions and maintain event selections. Prefer writing an assessment and its corresponding story in one transaction.

For another article about an existing event, supply its existing `event_id` on the assessment. Event grouping remains an editorial decision; a new URL alone cannot prove that an incident is new. Published scores and clock positions are computed from the eight criteria. Writer-supplied score labels and clock text remain source metadata.

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

The saved n8n workflow exports include this distinction in the research and scoring prompts. `n8n/Skynet Countdown v1.1.json` contains the PostgreSQL upserts; its approved T3/autonomy guidance is aligned with the original export. The workflow collects binary checks, amplifier ratings and raw summary metadata; the API calculates the published score and severity. Import the chosen saved workflow into n8n to apply its guidance to future collection runs.

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

History sorts events by incident date, then stable ID. Each displayed movement is the difference between the positions before and after that event. Late discoveries and explicit assessment changes recompute the history. The methodology version, latest incident date and database update timestamp are visible in the app.

The `total_score` and `classification` values reflect the workflow's unweighted export format. They, along with `clock_delta_minutes`, `severity_label`, `clock_delta_label` and `updated_clock_position`, are retained as automation metadata. The app derives published scores and severities from the eight criterion columns, then calculates the clock from those published scores.

## CSV migration baseline

- 63 assessment rows, containing 51 distinct assessments grouped into 40 events.
- 38 editorial reports cover 32 events; eight events have no editorial copy.
- 113 published evidence points derived from the selected criterion values.
- 27:25 symbolic minutes remaining; 54.3/100 evidence pressure.
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
