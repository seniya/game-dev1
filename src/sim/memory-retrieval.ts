import type { Memory } from './types';
import { TICKS_PER_DAY } from './types';

export interface MemoryQuery { npcIds?: string[]; locationIds?: string[]; types?: Memory['type'][] }
/** Bounded, deterministic retrieval over this resident's knowledge only. No global journal lookup. */
export function retrieveMemories(memories: Memory[], tick: number, query: MemoryQuery = {}, limit = 8) {
  return memories.map(memory => {
    const recency = Math.pow(.995, Math.max(0, tick - (memory.lastRetrievedAt ?? memory.createdAt)) / (TICKS_PER_DAY / 24));
    const importance = memory.importance / 100;
    const dimensions = [query.npcIds?.length ? Number(memory.relatedNpcIds.some(id => query.npcIds!.includes(id))) : undefined,
      query.locationIds?.length ? Number(memory.relatedLocationIds.some(id => query.locationIds!.includes(id))) : undefined,
      query.types?.length ? Number(query.types.includes(memory.type)) : undefined].filter((v): v is number => v !== undefined);
    const relevance = dimensions.length ? dimensions.reduce((a, b) => a + b, 0) / dimensions.length : 0;
    return { memory, recency, importance, relevance, score: recency + importance + relevance };
  }).sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt || a.memory.id.localeCompare(b.memory.id, 'en'))
    .slice(0, Math.max(0, Math.min(8, limit)));
}
