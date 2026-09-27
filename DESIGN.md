# Design

## Source of truth
Active · 27 September 2026. Surfaces: clock, incident archive, individual reports, methodology. Evidence: README.md, both source CSVs, the n8n prompts and the user's visual feedback. The visual direction uses the original open clock, the supplied Anta font for H1/H2 headings and two supplied Terminator images sparingly. Reference assets inspected: assets/terminator-1.png, terminator-2.png and terminator-3.png; public/fonts/Anta/Anta-Regular.ttf and its OFL licence.

## Brand
An independent practitioner's field journal: technically literate, dry, curious, occasionally darkly funny. Terminator influences appear in the instruments, warning red, Anta headings and two considered images. Earn trust through linked sources, visible reasoning, explicit limitations and separate facts/analysis. Avoid panic, faux classified information, invented scientific certainty and decorative glitches. The imagery is a framing device; it must not crowd the evidence or obscure text.

## Product goals
Make the latest position understandable in seconds; let readers trace it to evidence; explain and reproduce scoring. Support appended CSVs. Deliver a working local, static web app.
Non-goals: executing or modifying the live n8n workflow, user accounts, a CMS, automatic source verification, production deployment, or a probability forecast.
Success: calculations and joins have regression coverage; all reports and methodology are reachable; keyboard and small-screen flows work.

## Personas and jobs
Technical peers inspect the evidence and disagree with individual scores. Senior decision-makers scan the trend and read a concise explanation. Both need immediate context without having to decode a dashboard.

## Information architecture
Header navigation: The clock, Incident archive, Methodology. Hash routes work on static hosts without rewrite rules: /#/, /#/incidents, /#/incidents/:id, /#/methodology. Home: proposition and clock, current evidence summary, interactive history, recent reports, methodology invitation. Archive: searchable/filterable reports. Detail: factual account, editorial take, all eight criterion ratings, weighted published score out of 17, source and assessment variants. Methodology: formula, Trifecta weighting, amplifier anchors, interactive worked examples, sourcing, limitations and raw downloads.

## Design principles
Make the clock the visual anchor. Use large typography and whitespace to pace a dense subject. Use color to support text labels. Show editorial judgement as judgement. Reuse source content faithfully, removing machine citation markers only. Never confuse missing editorial copy with an authored report.

## Visual language
Near-black #101210, warm white #eeeee7, muted sage-gray #8d958b, red-orange #f15b40, fine borders #30352f. Occasional pale panels within the methodology. Anta Regular is the H1/H2 face throughout; its wider proportions need smaller sizes and more line height than the original condensed headings. Barlow Condensed remains on the clock digits, numeric instruments, branding and existing H3 accents. DM Sans supplies body text and IBM Plex Mono supplies technical labels. All fonts are hosted locally. Max content width 1360px; 8px spacing grid; square edges and minimal rounding. Responsive SVG instrumentation and charts; simple inline line icons. Motion is limited to short transitions, disabled for reduced motion.

The clock uses its original fine ticks and open, unframed face. The experimental metal rim, recessed housing, glass overlay and added digit glow were rejected and removed. Quiet frame edges on the score inspector/calculator, a satin statistics divider and a shallow hero-button bevel remain secondary.

Use one image per selected page. Home ends with the transparent terminator-3 figure, cropped to the upper body beside the closing manifesto; on mobile the image follows the text. Methodology places the transparent terminator-1-no-bg.png portrait (500 × 500) directly beneath “Show your working” in the title column. Show its natural square composition with an intact head, a modest 340px maximum width (260px on mobile), a soft bottom alpha fade, and narrow alpha feathering at the shoulder edges. Keep the figure background and its corners transparent so the page texture shows through; do not paint page-coloured gradients or a rectangular overlay behind or over it. The accompanying introduction stays in the other column on desktop/tablet, with the hero stacking below 700px. A faint, static red flare beside the home figure echoes the red-eye photography. No image or flare sits behind readable copy, no animation is added, and no imagery is repeated in the archive or incident reports. Source PNGs are preserved and loaded lazily with explicit dimensions. The branded terminator-2 poster is not used in the interface.

## Components
Root CSS owns tokens, including the heading face and quiet instrument edge lighting. Shared header/footer, severity label, incident row/card, scoring bars, time readout, section heading. Clock uses its original ticked dial and oversized digital readout. Decorative SVG layers and editorial imagery are hidden from assistive technology; headings and data retain semantic HTML. History combines a selectable chart with an accessible native range control. Archive uses native controls with labeled active state. Every interactive control has a functional outcome.

## Accessibility
Target WCAG 2.2 AA. Semantic landmarks and headings; skip link; visible focus; labeled controls; 44px touch targets. Charts have text summaries and keyboard controls. Score/state is always also text. Respect prefers-reduced-motion. No realtime flashing or fake ticking. Route changes update title, reset scroll and move focus to main content.

## Responsive behavior
Desktop: broad two-column hero, data strip, spacious report grid. Below 900px: stacked hero and two-column cards. Below 600px: compact header, single-column reports, legible dial, wrap filters, full-width controls. No hover-only information or horizontal page overflow at 375px.

## Interaction states
Data is bundled locally, so no artificial loading state. Empty archive explains how to clear filters. Unknown routes provide a return link. Invalid data produces a visible error instead of invented clock values. Unmatched editorial reports remain out of the published joins and are reported by validation. Assessment-only events identify that editorial coverage is pending. External sources open with safe link attributes.

## Content voice
Plain, precise British English. Dry humour belongs in editorial context. Use "symbolic time", "evidence points", "published score", "share of the remaining gap" and "editorial index". Describe an incident's published score and gap share as its stable impact measures; describe seconds as its movement at that point in the timeline. Make clear that criterion ratings are assessor judgements and the 0–17 total is a deterministic calculation from them. Do not claim the display measures a probability, a predicted date or the actual percentage of human control. Zero-score records remain visible with no clock movement. The CVE-style identifier is a source reference, not a unique database key.

## Implementation constraints
Vite, React, TypeScript, CSS, inline SVG. Active Trifecta counts map to 0, 1, 3 and 7 points; all five amplifier ratings are then added for a maximum published score of 17. T3 measures permission and capability for external action without per-action approval. The autonomy amplifier separately measures operation beyond meaningful checkpoints, using explicit 0/1/2 anchors; T3 alone never supplies autonomy evidence. The app calculates symbolic seconds as `3600 × 2^(-B / 100)`, where `B` is cumulative published evidence points. Each incident closes `100 × (1 − 2^(-s / 100))` per cent of the remaining gap, where `s` is its published score. Source workflow score, severity and movement fields remain metadata and are never presented as the authoritative calculation. Local CSV imports require rebuilding to publish changes. No browser secrets or live automation connections. Tests cover parsing, reconciliation, weighted scoring, severity bands, criterion boundaries, exponential calibration, fixed gap shares, saturation, zero scores, append behaviour, routes and main interactions.

## Open questions
- [x] Production host: GitHub Pages via Actions, with skynetcountdown.org configured in Pages settings.
- [ ] Future treatment of governance improvements and formal recovery events — owner: editor; methodology 1.0 only accumulates non-negative evidence.
- [ ] Future n8n export should emit a persistent event key and source/date on editorial records — owner: workflow maintainer; historical collisions are reconciled explicitly in this app.
