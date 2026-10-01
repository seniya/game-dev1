import { dayOf, timeLabel } from '../sim/random';
import type { WorldEvent } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function storyEvent(e: WorldEvent) {
  const evidence = [...new Set([...(e.causeId ? [e.causeId] : []), ...(Array.isArray(e.data.evidence) ? e.data.evidence : [])])].slice(0,6);
  const label = e.kind === 'rumor' ? '전해 들은 소문' : e.kind === 'witness' ? '목격자의 기록' : e.kind === 'relationship' ? '주민의 관계 해석' : '실제 사건';
  return `<article class="story-event" data-reading-key="story-${esc(e.id)}"><small>${dayOf(e.tick)}일 ${timeLabel(e.tick)} · ${label}</small><button class="story-original" data-event="${esc(e.id)}">${esc(e.description)}</button>${typeof e.data.meaning === 'string' ? `<p>${esc(e.data.meaning)}</p>` : ''}${evidence.length ? `<div class="story-evidence">${evidence.map(id=>`<button class="text-button" data-event="${esc(id)}">${id === e.causeId ? '계기가 된 사건' : '판단에 사용한 근거'} ${esc(id)} ↗</button>`).join('')}</div>` : ''}</article>`;
}
