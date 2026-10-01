import type { WorldEvent } from '../sim/types';
import { storyEvent } from './story-event';
export function relationshipTimeline(events: WorldEvent[]) {
  const ordered=[...events].sort((a,b)=>a.tick-b.tick || events.indexOf(b)-events.indexOf(a));
  const stage=(e:WorldEvent)=>e.kind==='rumor'?'전해 들은 이야기':e.kind==='witness'?'목격한 장면':e.kind==='relationship'?'관계를 받아들인 방식':e.kind==='gathering'?(e.data.phase==='completed'?'함께 마친 활동':e.data.phase==='proposed'?'다음 만남의 제안':'약속을 이어가는 과정'):['theft','default'].includes(e.kind)?'갈등과 손실':['share','loan','repayment'].includes(e.kind)?'도움과 교환':['family','birth','inheritance','death'].includes(e.kind)?'가족과 생애':'만남과 생활';
  return `<section class="relationship-timeline" aria-label="관계 변화 타임라인"><h3>시간을 따라 이어진 관계</h3><p class="muted">불러온 기록을 오래된 순서로 표시합니다. 더 오래된 만남은 이전 이야기에서 확인하세요. 기록된 근거만 연결합니다.</p>${ordered.map(e=>`<div class="relationship-milestone"><span class="timeline-stage">${stage(e)}</span>${storyEvent(e)}</div>`).join('')||'<p>이 두 주민이 함께 등장하는 기록이 아직 없습니다.</p>'}</section>`;
}
