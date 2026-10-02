import type { WorldStore } from './store';
import type { StoredWorld } from './world';
import { HISTORY_KINDS, HISTORY_TOPICS, type HistoryTopic } from '../sim/history';
import type { WorldEvent } from '../sim/types';
import { archiveRecords } from '../shared/archive';
import { compactWorld } from './world';

export async function readHistory(store: WorldStore, current: StoredWorld, p: URLSearchParams) {
  const topic = p.get('topic') ?? 'population';
  if (!HISTORY_TOPICS.includes(topic as HistoryTopic)) throw new Error('역사 조회 주제가 올바르지 않습니다.');
  if (p.get('epoch') && p.get('epoch') !== current.epoch) throw new Error('역사 조회 세계가 변경되었습니다.');
  const clauses = ['e.epoch=?', 'e.seq<=?', "(e.kind<>'health' OR json_extract(e.body,'$.importance')>=45)"], values: (number | string)[] = [current.epoch, current.meta.eventCount];
  const kinds = HISTORY_KINDS[topic as HistoryTopic]; clauses.push(`e.kind IN (${kinds.map(() => '?').join(',')})`); values.push(...kinds);
  for (const [param, sql] of [['before', 'e.seq<?'], ['from', 'e.tick>=?'], ['to', 'e.tick<=?']] as const) {
    if (!p.has(param)) continue;
    const n = Number(p.get(param)); if (!Number.isSafeInteger(n) || n < 0) throw new Error('역사 조회 날짜가 올바르지 않습니다.'); clauses.push(sql); values.push(n);
  }
  const npc = p.get('npc'), settlement = p.get('settlement');
  if (npc) { if (!current.state.npcs.some(n => n.id === npc)) throw new Error('역사 조회 주민이 없습니다.'); clauses.push('EXISTS(SELECT 1 FROM participants p WHERE p.epoch=e.epoch AND p.event=e.id AND p.npc=?)'); values.push(npc); }
  if (settlement) {
    if (!current.state.civilization.settlements.some(v => v.id === settlement)) throw new Error('역사 조회 도시가 없습니다.');
    clauses.push("(json_extract(e.body,'$.data.settlementId')=? OR json_extract(e.body,'$.data.from')=? OR json_extract(e.body,'$.data.to')=?)"); values.push(settlement, settlement, settlement);
  }
  const rows = await store.archive().prepare(`SELECT e.body,e.seq FROM events e WHERE ${clauses.join(' AND ')} ORDER BY e.seq DESC LIMIT 41`).bind(...values).all<{ body: string; seq: number }>();
  let comparison: { first: WorldEvent; last: WorldEvent } | undefined;
  if (settlement && !npc) {
    const bounds = ['epoch=?', "kind='urban'", "json_extract(body,'$.data.settlementId')=?", 'seq<=?'], boundValues: (string | number)[] = [current.epoch, settlement, current.meta.eventCount];
    if (p.has('from')) { bounds.push('tick>=?'); boundValues.push(Number(p.get('from'))); }
    if (p.has('to')) { bounds.push('tick<=?'); boundValues.push(Number(p.get('to'))); }
    const rows = await store.archive().batch<{ body: string }>(['ASC', 'DESC'].map(order => store.archive().prepare(`SELECT body FROM events WHERE ${bounds.join(' AND ')} ORDER BY seq ${order} LIMIT 1`).bind(...boundValues)));
    if (rows[0].results.length && rows[1].results.length) comparison = { first: JSON.parse(rows[0].results[0].body), last: JSON.parse(rows[1].results[0].body) };
  }
  return { comparison, epoch: current.epoch, topic, events: rows.results.slice(0, 40).map(r => JSON.parse(r.body) as WorldEvent), next: rows.results.length > 40 ? rows.results[39].seq : null, throughTick: current.state.tick, note: '표시된 사건은 해당 조건의 기록입니다. 시간 순서만으로 인과관계를 단정하지 않으며 원인 링크가 있는 경우에만 연결합니다.' };
}

/** Pins a committed snapshot and event watermark. Later commits/resets cannot mix into this export. */
export function streamWorld(store: WorldStore, current: StoredWorld): Response {
  const { events: _events, ...state } = current.state;
  const archive=store.archive(); // Freeze the pending-event overlay once for the entire stream.
  const encoder = new TextEncoder(); let cursor = 0, started = false, first = true, finished = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) { started = true; controller.enqueue(encoder.encode(JSON.stringify(state).slice(0, -1) + ',"events":[')); return; }
        if (finished) { controller.close(); return; }
        const rows = await archive.prepare('SELECT body,seq FROM events WHERE epoch=? AND seq>? AND seq<=? ORDER BY seq LIMIT 100').bind(current.epoch, cursor, current.meta.eventCount).all<{ body: string; seq: number }>();
        if (!rows.results.length) {
          if (cursor !== current.meta.eventCount) throw new Error('사건 아카이브가 누락되어 내보내기를 중단했습니다.');
          controller.enqueue(encoder.encode(']}')); finished = true; return;
        }
        for (const r of rows.results) { if (r.seq !== cursor + 1) throw new Error('사건 순서가 누락되었습니다.'); cursor = r.seq; }
        controller.enqueue(encoder.encode((first ? '' : ',') + rows.results.map(r => r.body).join(','))); first = false;
      } catch (e) { controller.error(e); }
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="living-small-world-server-${current.state.seed}-${current.state.tick}.save.json"`, 'Cache-Control': 'no-store', 'X-World-Revision': String(current.revision), 'X-Content-Type-Options': 'nosniff' } });
}

/** Bounded records can be verified and resumed without parsing the entire historical journal. */
export function streamArchive(store:WorldStore,current:StoredWorld):Response {
  const archive=store.archive(),encoder=new TextEncoder();
  async function* events(){
    let cursor=0;
    while(cursor<current.meta.eventCount){
      const rows=await archive.prepare('SELECT body,seq FROM events WHERE epoch=? AND seq>? AND seq<=? ORDER BY seq LIMIT 50').bind(current.epoch,cursor,current.meta.eventCount).all<{body:string;seq:number}>();
      if(!rows.results.length)throw Error('아카이브 사건이 누락되었습니다.');
      for(const row of rows.results){if(row.seq!==cursor+1)throw Error('아카이브 순서가 누락되었습니다.');cursor=row.seq;yield JSON.parse(row.body);}
    }
  }
  const records=archiveRecords(compactWorld(current.state),events(),current.meta.eventCount);
  const stream=new ReadableStream<Uint8Array>({async pull(controller){try{const next=await records.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));}catch(e){controller.error(e);}},async cancel(){await records.return(undefined);}});
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Content-Disposition':`attachment; filename="living-small-world-${current.state.seed}-${current.state.tick}.lsw"`,'Cache-Control':'no-store','X-World-Revision':String(current.revision),'X-Content-Type-Options':'nosniff'}});
}
