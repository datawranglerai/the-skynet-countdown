# Design

## Source of truth
Active · 26 September 2026. Surfaces: clock, incident archive, individual reports, methodology. Evidence: README.md, both source CSVs, the n8n research/scoring/writing prompts, and the user's decision to redesign the clock scale. No existing app, visual references or assets were supplied. The revised scale below supersedes the README's original minute mapping in this app.

## Brand
An independent practitioner's field journal: technically literate, dry, curious, occasionally darkly funny. Terminator influences appear in the instruments, warning red and industrial type. Earn trust through linked sources, visible reasoning, explicit limitations and separate facts/analysis. Avoid panic, faux classified information, invented scientific certainty, decorative glitches and movie imagery.

## Product goals
Make the latest position understandable in seconds; let readers trace it to evidence; explain and reproduce scoring. Support appended CSVs. Deliver a working local, static web app.
Non-goals: executing or modifying the live n8n workflow, user accounts, a CMS, automatic source verification, production deployment, or a probability forecast.
Success: calculations and joins have regression coverage; all reports and methodology are reachable; keyboard and small-screen flows work.

## Personas and jobs
Technical peers inspect the evidence and disagree with individual scores. Senior decision-makers scan the trend and read a concise explanation. Both need immediate context without having to decode a dashboard.

## Information architecture
Header navigation: The clock, Incident archive, Methodology. Hash routes work on static hosts without rewrite rules: /#/, /#/incidents, /#/incidents/:id, /#/methodology. Home: proposition and clock, current evidence summary, interactive history, recent reports, methodology invitation. Archive: searchable/filterable reports. Detail: factual account, editorial take, all eight scoring criteria, source, original assessment variants. Methodology: formula, criteria, interactive worked examples, sourcing and limitations, raw downloads.

## Design principles
Make the clock the visual anchor. Use large typography and whitespace to pace a dense subject. Use color to support text labels. Show editorial judgement as judgement. Reuse source content faithfully, removing machine citation markers only. Never confuse missing editorial copy with an authored report.

## Visual language
Near-black #101210, warm white #eeeee7, muted sage-gray #8d958b, red-orange #f15b40, fine borders #30352f. Occasional pale panels within the methodology. Condensed display type (self-hosted if available, Impact/Arial Narrow fallback), clean sans-serif body, monospaced numerical labels. Max content width 1360px; 8px spacing grid; square edges and minimal rounding. No decorative shadows. Responsive SVG instrumentation and charts; simple inline line icons. Motion limited to short fades and subtle status pulse, disabled for reduced motion.

## Components
Root CSS owns tokens. Shared header/footer, severity label, incident row/card, scoring bars, time readout, section heading. Clock uses a ticked dial and oversized digital readout. History combines a selectable chart with an accessible native range control. Archive uses native controls with labeled active state. Every interactive control has a functional outcome.

## Accessibility
Target WCAG 2.2 AA. Semantic landmarks and headings; skip link; visible focus; labeled controls; 44px touch targets. Charts have text summaries and keyboard controls. Score/state is always also text. Respect prefers-reduced-motion. No realtime flashing or fake ticking. Route changes update title, reset scroll and move focus to main content.

## Responsive behavior
Desktop: broad two-column hero, data strip, spacious report grid. Below 900px: stacked hero and two-column cards. Below 600px: compact header, single-column reports, legible dial, wrap filters, full-width controls. No hover-only information or horizontal page overflow at 375px.

## Interaction states
Data is bundled locally, so no artificial loading state. Empty archive explains how to clear filters. Unknown routes provide a return link. Invalid data produces a visible error instead of invented clock values. Unmatched editorial reports remain out of the published joins and are reported by validation. Assessment-only events identify that editorial coverage is pending. External sources open with safe link attributes.

## Content voice
Plain, precise British English. Dry humour belongs in editorial context. Use "symbolic time", "evidence points" and "editorial index". Do not claim the display measures a probability, a predicted date or the actual percentage of human control. Zero-score records remain visible with no clock movement. The original CVE identifier is a legacy reference, not a unique database key.

## Implementation constraints
Vite, React, TypeScript, CSS, inline SVG. Source CSVs and workflow remain unchanged. Preserve raw original minute values only as historical assessment metadata. Local CSV imports require rebuilding to publish changes. No browser secrets or live automation connections. Tests cover parsing, reconciliation, calibration, saturation, zero scores, append behaviour, routes and main interactions.

## Open questions
- [ ] Production host and custom domain — owner: user; does not block local delivery.
- [ ] Future methodology for governance improvements and formal assessment corrections — owner: editor; v1 only scores the supplied non-negative evidence.
- [ ] Future n8n export should emit a persistent event key and source/date on editorial records — owner: workflow maintainer; historical collisions are reconciled explicitly in this app.
