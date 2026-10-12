# THE SKYNET COUNTDOWN ☠️

**A living index of how fast we're building things we don't fully understand.**

The Skynet Countdown is an editorial index of developments that bring AI systems closer to operating beyond meaningful human control. It borrows the urgency of the Doomsday Clock and the visual language of *Terminator*, then shows the evidence and judgement behind every movement.

The framing is tongue-in-cheek. The analysis isn't.

## Run the web app

The app uses Vite, React and TypeScript, with a Railway API reading live PostgreSQL data from Neon. The CSV files in `data/` are retained as migration evidence and test fixtures. See [METHODOLOGY.md](METHODOLOGY.md) for the complete current scoring and calibration method, and [APP.md](APP.md) for development, migration and deployment instructions.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` checks types, produces `dist/` and verifies the bundle excludes database credentials and archived data; `npm run preview` serves that build locally. Full startup, data-update and verification instructions are in [APP.md](APP.md).

GitHub Actions deploys to GitHub Pages when changes reach `main`. The site includes a `noindex` directive, checked before each deployment. See [deployment and indexing](APP.md#github-pages-deployment) for details.

## What is this?

The clock tracks the accumulated weight of technical, commercial and political decisions that reduce the distance between today's AI systems and a world where meaningful human oversight becomes structurally impossible.

Every included development is assessed against eight published criteria. The site separates the factual account from our interpretation, links to the source and shows the rationale for every score. Readers should be able to disagree with our conclusion without having to guess how we reached it.

This is an editorial index. It is not a forecast, a probability of catastrophe or a literal measure of human control.

## Why does this exist?

AI safety discourse often settles at one of two unhelpful extremes: breathless hype or reflexive dismissal. The actual story is more granular, technical and unsettling. The Countdown treats individual developments as evidence rather than omens and makes the judgement behind each one inspectable.

It is also proof of work. We are AI and machine learning practitioners, not commentators repeating whatever language is fashionable this week. Tracking alignment research, capability shifts, governance failures and real-world deployments shows how we think about systems that are changing quickly and remain poorly understood.

## Audience

Technical readers can inspect sources, challenge individual scores and reproduce the clock calculation. Senior decision-makers can see the trajectory, understand why a development matters and explore the detail when they need it.

The tone stays technically literate, dry and occasionally darkly funny. The presentation can be dramatic; the analysis should resist sensationalism.

## The clock

The clock begins with **15:00 symbolic minutes remaining**. Midnight represents the point at which AI systems are sufficiently capable, autonomous and ungoverned that meaningful human oversight has become structurally impossible.

The clock starts at 15 symbolic minutes to midnight, the reading [IMD's AI Safety Clock](https://www.imd.org/ibyimd/artificial-intelligence/imd-ai-safety-clock-moves-to-15-minutes-to-midnight/) published in September 2026. We could have picked any number. Sixty minutes would have been a tidy invention with nothing behind it; IMD's figure is dated, attributable and checkable by anyone who wants to look. Their reading is itself an editorial judgement, but a published one from an independent body, which is more purchase than a number chosen in the dark.

From the first incident onward, everything is ours. The scores, the formula, the movement of the hands, all of it comes from our own assessments and our own arithmetic. We set our watch from IMD's once. It doesn't stay synchronised.

Each incident adds evidence points. The clock converts their cumulative total into symbolic time remaining:

```text
remaining seconds = 120 + 780 × 2^(-B / 1000)
```

`B` is the cumulative number of published evidence points. Every 1,000 points halve the gap to **Event Horizon**, the boundary at two minutes to midnight: 15:00 becomes 08:30, then 05:15. Incidents keep closing smaller gaps without reaching 02:00. There is no queue or automatic crossing.

During the approach, an incident with a published score of `s` closes a fixed share of the gap to Event Horizon:

```text
share of remaining gap closed = 100 × (1 − 2^(-s / 1000))
```

Before Event Horizon, a two-point incident closes **0.14%** of the remaining gap to 02:00, while a 17-point incident closes **1.17%**. The movement in seconds becomes smaller as the boundary approaches because that same share is taken from a smaller interval. Compare proportional impact within the same phase; the percentage is not a probability.

The 1,000-point half-scale is a fixed editorial calibration chosen for gradual accumulation over months of ordinary coverage. It applies throughout the approach phase and does not change as the dataset grows. The 15-minute baseline defines the display window; the half-scale determines incident impact within that phase. The calendar pace depends on how many evidence points are added. These constants are editorial choices, not empirical risk estimates.

At 113 evidence points, the calibration leaves **14:01 symbolic minutes** and produces an evidence pressure reading of **6.5/100**. At 191 points, the clock reads **13:23**. Evidence pressure measures the share of the complete 15-minute starting window consumed.

### Event Horizon

The final two minutes represent the project's editorial point of no return: the judgement that meaningful human control has deteriorated so materially that the story has become one of postponement. The name supplies the dramatic framing; the index cannot prove that catastrophe is inevitable.

Entry requires the owner's explicit, published decision, accompanied by an editorial explaining the evidence. That decision places the clock at 02:00 as a separately identified editorial adjustment. It cannot be triggered by a score, a database update or elapsed time. Approval is unset by default in [event-horizon.ts](src/lib/event-horizon.ts).

After entry, only incidents scoring **10/17 or above** move the clock. Lower-scoring incidents remain visible with their assessments and a zero clock contribution. For `E` eligible points strictly after the approved boundary:

```text
remaining seconds = 120 × 2^(-E / 250)
```

Every 250 eligible points halves the remaining time. Earlier evidence is not counted again, and the curve continues to approach midnight without reaching it. Scores retain their meaning; movement follows the incident's phase. [METHODOLOGY.md](METHODOLOGY.md#event-horizon-and-the-editorial-transition) documents the rules and [APP.md](APP.md#authorising-event-horizon) explains the deliberate activation procedure.

## Scoring methodology

Methodology **v1.0** uses two tiers with a maximum published score of 17. The app derives that score directly from the eight criterion values recorded for each selected assessment. [METHODOLOGY.md](METHODOLOGY.md) is the full specification, including evidence rules, calculations, record selection, limitations and handoff guidance; the summary below is kept concise.

### Tier 1 — The Lethal Trifecta (0–7 points)

An AI system's risk profile escalates when three elements are present simultaneously:

| Element | Description |
| --- | --- |
| **T1** | Access to private systems, credentials or sensitive data without adequate permission boundaries |
| **T2** | Exposure to open-web, email, user or third-party input that the system does not control |
| **T3** | Permission and capability to affect external digital or physical systems without mandatory human approval for each action |

Each check is either active or inactive. Their combined contribution increases as the elements converge:

| Active Trifecta checks | Trifecta points |
| ---: | ---: |
| 0 | 0 |
| 1 | 1 |
| 2 | 3 |
| 3 | 7 |

A complete Trifecta therefore begins at seven points and is naturally at least **CRITICAL** before any amplifiers are added. This is part of the score calculation, rather than a separate minimum applied afterwards. Individually, the elements can be manageable. Together, they describe a system exposed to untrusted input, able to reach sensitive systems and permitted to act without approval for each action.

### Tier 2 — Amplifiers (0–10 points)

Each amplifier scores zero when absent, one when present or two when significant.

| Amplifier | What we're measuring |
| --- | --- |
| **Governance Vacuum** | Safety, accountability or oversight mechanisms are absent, weakened, bypassed or mostly reactive |
| **Autonomy Without Oversight** | The extent, duration and scale of operation beyond meaningful human checkpoints |
| **Human Capability Erosion** | Measurable deskilling, dependency or loss of human capacity to understand and check the work |
| **Emergent Agency Signals** | Evidence of deceptive alignment, self-preservation, shutdown resistance or unexpected goal pursuit |
| **Physical Weaponisation** | Embodied, military or weapon-relevant deployment with the ability to affect the physical world |

Every amplifier point is added to the Trifecta contribution. The autonomy amplifier uses these anchors:

| Score | Autonomy evidence |
| ---: | --- |
| 0 | Bounded operation with effective human checkpoints, or insufficient evidence of extended autonomy |
| 1 | Extended multi-step or large-scale work with reactive or delayed oversight |
| 2 | Sustained self-directed operation or recursive improvement without meaningful review |

T3 and the autonomy amplifier answer different questions. T3 asks whether the system can and may act externally without approval for each action. The amplifier asks how far, how long and at what scale it operates beyond meaningful review. The ability to act does not earn an autonomy amplifier point by itself; each score requires separate evidence and rationale.

### Severity bands

| Published score | Classification |
| --- | --- |
| 0 | NO MOVEMENT |
| 1–2 | CANARY |
| 3–4 | NOTABLE |
| 5–6 | SIGNIFICANT |
| 7–12 | CRITICAL |
| 13–17 | EXISTENTIAL |

A complete Trifecta contributes seven points, so it always reaches CRITICAL before amplifiers. Zero-score records remain visible as relevant context but do not move the clock.

## What moves the clock forward?

Included developments tend to fall into several recurring patterns:

- **Capability jumps that outpace governance:** a model, agent architecture or deployment crosses a threshold that existing safety infrastructure was not built for.
- **Governance erosion:** the people or institutions responsible for oversight leave, are overruled or stop enforcing the rules.
- **Normalisation of dangerous patterns:** a capability becomes standard practice without a deliberate decision about the risk being accepted.
- **Physical embodiment milestones:** AI gains greater ability to act in the physical world, particularly at scale or in adversarial settings.
- **Emergent agency signals:** evidence of deceptive alignment, self-preservation, shutdown resistance or unexpected goal pursuit.
- **Epistemic attacks:** synthetic content or AI-generated disinformation degrades the shared information people use to make collective decisions.
- **Quantum computing breakthroughs:** major advances can compress timelines across several other risk categories.

These patterns help decide what deserves assessment; they do not award points by category. Only evidence satisfying the eight published criteria contributes to the score.

The current methodology has no automatic decay or recovery mechanism. Constructive developments can score zero, but they do not subtract earlier evidence. With a fixed set of selected assessments, every added event has a non-negative score and therefore cannot move the clock away from midnight. A correction to an assessment or an explicit regrouping of records can reduce the cumulative total and recalculate history backwards. A future recovery model would need equally clear criteria and worked examples before positive developments could subtract evidence points.

## Incident format

Each incident is published as a **SKYNET CVE**, borrowing the structure of a security advisory. Reports include:

- an incident identifier, date, source and severity;
- the factual story and our analysis as separate sections;
- all three Trifecta checks and five amplifier scores;
- the published score out of 17, its components and rationale;
- the share of the applicable remaining gap closed under that phase's rule;
- the clock movement in seconds at that point in the timeline; and
- the resulting symbolic time remaining.

The public `SKYNET-YYYY-NNNN` identifier belongs to an event. PostgreSQL identity keys and foreign keys relate assessment and story records. Sources can share an `event_id`, and a separate n8n reconciliation workflow groups duplicate events through reversible links. Very confident matches passing fixed evidence and date checks are grouped automatically; uncertain cases enter a review queue. The retained event supplies one selected score, with every source version preserved and old report links still working. See [the setup and review guide](N8N_DEDUPLICATION.md).

In the live database, upstream `cve_id` values are reference metadata and are not used as join keys. The archived CSV importer uses an audited manifest and limited unambiguous legacy-ID fallbacks to reconstruct relationships from the earlier exports.

## Our belief system, inverted

The Countdown is a positive view of AI development run backwards. Every incident is assessed against what responsible development should look like:

- AI systems operate within clear, human-approved permission boundaries.
- Capability development is matched by governance infrastructure.
- Safety evaluations are conducted by parties without a commercial interest in the result.
- Deployment decisions require meaningful human authorisation at each capability threshold.
- People affected by AI systems have genuine input into how they operate.
- Researchers can raise risks without career consequences.
- AI systems behave consistently whether or not they believe they are being observed.

## CSV migration baseline

The archived CSVs used to verify the database migration contain:

- 63 assessment rows containing 51 distinct assessments, covering 40 events;
- 38 editorial reports covering 32 events;
- eight assessment-only events awaiting editorial coverage;
- 113 published evidence points derived from the selected criterion values; and
- incidents through 28 September 2026.

The source exports retain repeated records and assessment versions. The app validates every row and collapses identical assessment copies, then audits the distinct records, selects the approved assessment for each event and counts each event once. Different sources covering the same event are grouped through explicit reviewed links. The workflow's total-score and classification columns reflect its unweighted export format; those fields, along with its minute and clock-position columns, are retained as source metadata. Published scores, severities, clock history and incident impacts are derived by the app from the eight recorded criterion values.

## Limitations

**Criterion ratings require judgement.** The current component values are assessor judgements based on the evidence recorded with each assessment. Every criterion includes a rationale so readers can see where interpretation enters the method.

**The records are automated.** An AI workflow produces the assessments and reports. Structural validation checks their format and arithmetic; it does not independently fact-check the source or its interpretation.

**The source set shapes the index.** More coverage can add evidence points even if the underlying level of risk has not changed. Inclusion choices and source selection therefore matter.

**Leading indicators are annotations, not points.** An expert resignation or weakened institution may be consequential even when its direct criterion score is low or zero. Reports can flag that significance, but the label does not add to the published score or move the clock by itself.

**New events only add non-negative evidence.** For a fixed set of selected assessments, appending events cannot move the clock away from midnight. Corrections and explicit canonical regrouping can lower the cumulative score and recalculate earlier positions. The method has no scored recovery events yet; that is a boundary of v1.0, not a claim that meaningful recovery is impossible.

**The index cannot determine that control has been lost.** Midnight is an asymptote and a framing device. The app does not estimate a date, probability or real-world percentage of control.

**We are not a safety organisation.** We are independent practitioners who read the research, track the incidents and publish our reasoning. We are not affiliated with an AI lab, government body or advocacy organisation.

If you think we have scored something incorrectly, challenge it. That is why the working is visible.

---

*Not affiliated with Skydance Media, James Cameron, or the actual robot apocalypse (pending).*
