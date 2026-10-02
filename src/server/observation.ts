import { DIGEST_KINDS, STORY_KINDS, RETURN_TOPICS, type ObserverPage } from '../sim/observation';
import type { WorldEvent } from '../sim/types';
import type { WorldStore } from './store';
import type { StoredWorld } from './world';
export async function readObserver(store: WorldStore, current: StoredWorld, p: URLSearchParams): Promise<ObserverPage> {
  if (p.get('epoch') !== current.epoch) throw new Error('관찰 세계가 바뀌었습니다. 다시 열어 주세요.');
  const number = (key: string, fallback: number, max: number) => {
    if (!p.has(key)) return fallback;
    const n = Number(p.get(key));
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error('관찰 기간이나 페이지가 올바르지 않습니다.');
    return n;
  };
  const from = number('from', Math.floor(current.state.tick / 144) * 144, current.state.tick + 1);
  const to = number('to', current.state.tick, current.state.tick);
  const through = number('through', current.meta.eventCount, current.meta.eventCount);
  const after = number('after', 0, through);
  const before = number('before', through + 1, through + 1);
  const ids = [...new Set(p.getAll('npc'))];
  if (ids.length > 12 || ids.some(id => !current.state.npcs.some(n => n.id === id))) throw new Error('관찰 주민을 찾을 수 없습니다.');
  const partner=p.get('partner');
  if(partner && (!ids.length || !current.state.npcs.some(n=>n.id===partner) || ids.includes(partner)))throw new Error('관계 상대를 확인해 주세요.');
  const kinds = p.get('mode') === 'story' ? STORY_KINDS : DIGEST_KINDS;
  const clauses = ['e.epoch=?','e.seq<=?','e.seq>?','e.tick>=?','e.tick<=?',`e.kind IN (${kinds.map(()=>'?').join(',')})`];
  const values: (string|number)[] = [current.epoch, through, after, from, to, ...kinds];
  if (ids.length) { clauses.push(`EXISTS(SELECT 1 FROM participants p WHERE p.epoch=e.epoch AND p.event=e.id AND p.npc IN (${ids.map(()=>'?').join(',')}))`); values.push(...ids); }
  if(partner) { clauses.push('EXISTS(SELECT 1 FROM participants pair WHERE pair.epoch=e.epoch AND pair.event=e.id AND pair.npc=?)'); values.push(partner); }
  if (p.get('mode') === 'story') clauses.push("(e.kind<>'consumption' OR json_extract(e.body,'$.data.caregiver') IS NOT NULL)");
  const where = clauses.join(' AND '), archive=store.archive();
  const [totals, rows, highlights] = await Promise.all([
    archive.prepare(`SELECT e.kind,count(*) AS n FROM events e WHERE ${where} GROUP BY e.kind`).bind(...values).all<{kind:string;n:number}>(),
    archive.prepare(`SELECT e.body,e.seq FROM events e WHERE ${where} AND e.seq<? ORDER BY e.seq DESC LIMIT 41`).bind(...values,before).all<{body:string;seq:number}>(),
    archive.prepare(`SELECT e.body FROM events e WHERE ${where} AND json_extract(e.body,'$.importance')>=45 ORDER BY json_extract(e.body,'$.importance') DESC,e.seq DESC LIMIT 3`).bind(...values).all<{body:string}>(),
  ]);
  const changes=await Promise.all(RETURN_TOPICS.map(async t=>{
    const rows=await archive.prepare(`SELECT e.body FROM events e WHERE ${where} AND e.kind IN (${t.kinds.map(()=>'?').join(',')}) AND json_extract(e.body,'$.importance')>=45 ORDER BY e.seq DESC LIMIT 2`).bind(...values,...t.kinds).all<{body:string}>();
    return {topic:t.id,label:t.label,events:rows.results.map(r=>JSON.parse(r.body) as WorldEvent)};
  }));
  return { changes, highlights: highlights.results.map(r=>JSON.parse(r.body) as WorldEvent), epoch: current.epoch, from, to, through, counts: Object.fromEntries(totals.results.map(r=>[r.kind,r.n])), total: totals.results.reduce((sum,r)=>sum+r.n,0), events: rows.results.slice(0,40).map(r=>JSON.parse(r.body) as WorldEvent), next: rows.results.length>40 ? rows.results[39].seq : null };
}
