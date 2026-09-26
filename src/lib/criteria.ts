import type { Criterion, Severity } from './types.ts';

export const CRITERIA: readonly Criterion[] = Object.freeze([
  { key: 't1', label: 'Ungoverned system access', shortLabel: 'Access', description: 'Access to private systems, credentials or sensitive data without adequate permission boundaries.', max: 1, tier: 'trifecta' },
  { key: 't2', label: 'Untrusted input exposure', shortLabel: 'Input', description: 'Exposure to open-web, email, user or third-party input that the system does not control.', max: 1, tier: 'trifecta' },
  { key: 't3', label: 'Autonomous external action', shortLabel: 'Action', description: 'Actions in digital or physical systems without mandatory human approval at each consequential step.', max: 1, tier: 'trifecta' },
  { key: 'governance', label: 'Governance vacuum', shortLabel: 'Governance', description: 'Safety, accountability or oversight mechanisms are absent, weakened, bypassed or mostly reactive.', max: 2, tier: 'amplifier' },
  { key: 'autonomy', label: 'Autonomy without oversight', shortLabel: 'Autonomy', description: 'Meaningful operation outside human decision loops, including long-horizon work or self-improvement.', max: 2, tier: 'amplifier' },
  { key: 'erosion', label: 'Human capability erosion', shortLabel: 'Erosion', description: 'Measurable deskilling, dependency or loss of human capacity to understand and check the work.', max: 2, tier: 'amplifier' },
  { key: 'sentience', label: 'Emergent agency signals', shortLabel: 'Agency', description: 'Evidence of deceptive alignment, self-preservation, shutdown resistance or unexpected goal pursuit.', max: 2, tier: 'amplifier' },
  { key: 'physical', label: 'Physical weaponisation', shortLabel: 'Physical', description: 'Embodied, military or weapon-relevant deployment with the ability to affect the physical world.', max: 2, tier: 'amplifier' },
]);

export interface SeverityDescriptor {
  label: Severity;
  min: number;
  max: number;
  description: string;
}

export const SEVERITY_DESCRIPTORS: Readonly<Record<Severity, SeverityDescriptor>> = Object.freeze({
  CANARY: { label: 'CANARY', min: 0, max: 2, description: 'A weak or early signal worth retaining in the evidence record.' },
  NOTABLE: { label: 'NOTABLE', min: 3, max: 4, description: 'A material development with limited immediate loss-of-control evidence.' },
  SIGNIFICANT: { label: 'SIGNIFICANT', min: 5, max: 6, description: 'Strong evidence that operational safeguards or human control are thinning.' },
  CRITICAL: { label: 'CRITICAL', min: 7, max: 9, description: 'Severe control pressure, or any incident satisfying the complete Trifecta.' },
  EXISTENTIAL: { label: 'EXISTENTIAL', min: 10, max: 13, description: 'The highest band for converging evidence across control, agency and consequence.' },
});

export const SEVERITIES: readonly Severity[] = Object.freeze([
  'CANARY',
  'NOTABLE',
  'SIGNIFICANT',
  'CRITICAL',
  'EXISTENTIAL',
]);
