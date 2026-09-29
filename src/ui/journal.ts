import type { WorldEvent } from '../sim/types';
import type { WorldView } from '../server/world';

export interface EventPage { epoch: string; events: WorldEvent[]; next: number | null; eventCount?: number; cursors?: Record<string, number> }
function matches(e: WorldEvent, query: URLSearchParams) {
  const npc = query.get('npc');
  if (npc && !e.participants.includes(npc) && e.actorId !== npc && e.targetId !== npc) return false;
  if (query.has('from') && e.tick < Number(query.get('from')) || query.has('to') && e.tick > Number(query.get('to'))) return false;
  if (query.get('q') && !JSON.stringify(e).toLowerCase().includes(query.get('q')!.toLowerCase())) return false;
  switch (query.get('filter')) {
    case 'important': return e.importance >= 45 || e.kind === 'weather';
    case 'social': return ['share', 'talk', 'witness', 'rumor', 'relationship', 'memory', 'family', 'birth', 'coming_of_age', 'education', 'migration', 'death'].includes(e.kind);
    case 'economy': return ['production', 'storage', 'trade', 'loan', 'repayment', 'default', 'theft', 'scarcity', 'wage', 'price', 'project', 'consumption', 'experiment', 'inheritance', 'construction', 'settlement', 'caravan', 'occupation'].includes(e.kind);
    default: return true;
  }
}
// The world response already contains its last 100 events. Reuse them while no gap exists.
// Archive sequence cursors remain valid even after trimming the live page to 40 rows.
export function mergeLiveJournal(page: EventPage, world: WorldView, query: URLSearchParams): EventPage | undefined {
  if (page.epoch !== world.epoch || page.eventCount === undefined || !page.cursors || page.events.length > 40) return;
  const added = world.meta.eventCount - page.eventCount;
  if (added === 0) return page;
  if (added < 0 || added > Math.min(100, world.state.events.length)) return;
  const fresh = world.state.events.slice(-added), cursors = { ...page.cursors };
  fresh.forEach((e, i) => { cursors[e.id] = page.eventCount! + i + 1; });
  const freshIds = new Set(fresh.map(e => e.id));
  const all = [...fresh.filter(e => matches(e, query)).reverse(), ...page.events.filter(e => !freshIds.has(e.id))];
  const events = all.slice(0, 40), last = events.at(-1);
  const next = last && (page.next !== null || all.length > 40) ? cursors[last.id] : null;
  if (next === undefined) return;
  return { epoch: page.epoch, events, next, eventCount: world.meta.eventCount, cursors: Object.fromEntries(events.map(e => [e.id, cursors[e.id]])) };
}
