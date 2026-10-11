import type { DatabaseEventParentRow, DatabaseEventRow } from './storage-types.ts';

export interface EventIdentityForest {
  rootByEventId: ReadonlyMap<string, string>;
  eventIdsByRoot: ReadonlyMap<string, readonly string[]>;
}

/** Resolve the stored child→parent links and reject every ambiguous graph. */
export function resolveEventIdentityForest(
  events: readonly DatabaseEventRow[],
  parents: readonly DatabaseEventParentRow[] = [],
): EventIdentityForest {
  const eventIds = new Set(events.map((event) => event.id));
  if (eventIds.size !== events.length) throw new Error('Event identity contains duplicate event ids.');

  const parentByChild = new Map<string, string>();
  for (const row of parents) {
    if (!eventIds.has(row.child_event_id)) throw new Error(`Event identity references unknown child ${row.child_event_id}.`);
    if (!eventIds.has(row.parent_event_id)) throw new Error(`Event identity references unknown parent ${row.parent_event_id}.`);
    if (row.child_event_id === row.parent_event_id) throw new Error(`Event identity ${row.child_event_id} cannot parent itself.`);
    if (parentByChild.has(row.child_event_id)) throw new Error(`Event identity child ${row.child_event_id} has multiple parents.`);
    parentByChild.set(row.child_event_id, row.parent_event_id);
  }

  const rootByEventId = new Map<string, string>();
  for (const event of events) {
    const path: string[] = [];
    const visiting = new Set<string>();
    let current = event.id;
    while (parentByChild.has(current)) {
      if (visiting.has(current)) throw new Error(`Event identity contains a cycle involving ${current}.`);
      visiting.add(current);
      path.push(current);
      current = parentByChild.get(current)!;
    }
    rootByEventId.set(event.id, current);
    for (const eventId of path) rootByEventId.set(eventId, current);
  }

  const eventIdsByRoot = new Map<string, string[]>();
  for (const event of events) {
    const root = rootByEventId.get(event.id)!;
    const members = eventIdsByRoot.get(root) ?? [];
    members.push(event.id);
    eventIdsByRoot.set(root, members);
  }
  return { rootByEventId, eventIdsByRoot };
}
