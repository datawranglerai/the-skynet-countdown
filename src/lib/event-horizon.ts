import type { EventHorizonApproval } from './types.ts';

// Activation is a deliberate editorial decision. Data, scores and elapsed time
// must never infer or activate this value.
export const EVENT_HORIZON_APPROVAL: EventHorizonApproval | null = null;
