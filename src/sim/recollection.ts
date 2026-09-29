import type { Memory } from './types';
export const RECOLLECTION_TOPICS = ['shared', 'support', 'hardship', 'family'] as const;
export type RecollectionTopic = typeof RECOLLECTION_TOPICS[number];
export const RECOLLECTION_LABELS: Record<RecollectionTopic, string> = { shared: '함께한 기억', support: '도움을 주고받은 기억', hardship: '어려움과 갈등의 기억', family: '가족과 계승의 기억' };
/** Filter the speaker's retained descriptions only; never reveal unremembered event data. */
export function recollections(memories: Memory[], listenerId: string, topic: RecollectionTopic = 'shared') {
  return memories.filter(m => m.relatedNpcIds.includes(listenerId) && (topic === 'shared' || topic === 'hardship' && ['trauma', 'economic'].includes(m.type) && m.emotionalImpact < 0 || topic === 'support' && /도움|도왔|나누|나눴|공유|갚|상환/.test(m.description) || topic === 'family' && /가족|부부|출생|태어|상속|계승|양육|자녀|기술/.test(m.description)))
    .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt).slice(0, 8);
}
