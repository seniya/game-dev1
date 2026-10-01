import { dayOf, timeLabel } from '../sim/random';
import type { WorldEvent } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function storyEvent(e: WorldEvent) {
  const labels:Record<string,string>={trust:'신뢰',affection:'애정',resentment:'불만',fear:'두려움',familiarity:'친밀',respect:'존중'};
  const changes=e.kind==='relationship'?Object.entries(labels).filter(([key])=>typeof e.data[`${key}Before`]==='number'&&typeof e.data[`${key}After`]==='number').map(([key,label])=>`${label} ${Number(e.data[`${key}Before`]).toFixed(1)} → ${Number(e.data[`${key}After`]).toFixed(1)}`).join(' · '):'';
  const evidence = [...new Set([...(e.causeId ? [e.causeId] : []), ...(Array.isArray(e.data.evidence) ? e.data.evidence : [])])].slice(0,6);
  const label = e.kind === 'rumor' ? '전해 들은 소문' : e.kind === 'witness' ? '목격자의 기록' : e.kind === 'relationship' ? '주민의 관계 해석' : '실제 사건';
  return `<article class="story-event" data-reading-key="story-${esc(e.id)}"><small>${dayOf(e.tick)}일 ${timeLabel(e.tick)} · ${label}</small><button class="story-original" data-event="${esc(e.id)}">${esc(e.description)}</button>${typeof e.data.meaning === 'string' ? `<p>${esc(e.data.meaning)}</p>` : ''}${changes?`<p class="story-measurements">당시 변화: ${changes}</p>`:''}${evidence.length ? `<div class="story-evidence">${evidence.map(id=>`<button class="text-button" data-event="${esc(id)}">${id === e.causeId ? '계기가 된 사건' : '판단에 사용한 근거'} ${esc(id)} ↗</button>`).join('')}</div>` : ''}</article>`;
}
