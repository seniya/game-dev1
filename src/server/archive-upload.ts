import { z } from 'zod';
import { ARCHIVE_FORMAT, ARCHIVE_LIMIT, ARCHIVE_STATE_LIMIT, ARCHIVE_EVENT_LIMIT, digestText } from '../shared/archive';
import { Simulation } from '../sim/engine';
import { eventSchema } from '../sim/validation';
import type { WorldEvent, WorldState } from '../sim/types';
import { cleanupUploads } from './uploads';
import type { WorldStore } from './store';
const schema=z.discriminatedUnion('type',[
  z.object({type:z.literal('start'),hash:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(ARCHIVE_LIMIT)}).strict(),
  z.object({type:z.literal('record'),id:z.string().uuid(),part:z.number().int().nonnegative().max(100000),line:z.string().min(1).max(140000)}).strict(),
  z.object({type:z.literal('finish'),id:z.string().uuid(),parts:z.number().int().positive().max(100000)}).strict(),
]);
interface Meta {id:string;phase:string;chain:string;events:number;expected:number;last_tick:number;state_bytes:number;entities:string|null}
interface Upload {id:string;member:string;epoch:string;hash:string;bytes:number;received:number;next:number;status:string;summary:string|null}
interface Entities {npcs:string[];buildings:string[];reserved:string[];tick:number;nextId:number}
async function stateFor(store:WorldStore,id:string){const rows=await store.db.prepare('SELECT body FROM upload_states WHERE upload=? ORDER BY part').bind(id).all<{body:string}>();return Simulation.load(rows.results.map(r=>r.body).join('')).snapshot();}
export async function archiveUpload(store:WorldStore,member:string,raw:unknown,now=Date.now()) {
  const input=schema.parse(raw),db=store.db;
  if(input.type==='start') {
    await cleanupUploads(db,now);
    const current=await store.read();
    const existing=await db.prepare("SELECT u.id,u.next,u.status FROM uploads u JOIN archive_imports a ON a.id=u.id WHERE u.member=? AND u.epoch=? AND u.hash=? AND u.bytes=? AND u.expires>? AND u.status IN ('archive','ready')").bind(member,current.epoch,input.hash,input.bytes,now).first<{id:string;next:number;status:string}>();
    if(existing)return existing;
    const id=crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO uploads(id,member,epoch,hash,bytes,status,expires) SELECT ?,?,?,?,?,'archive',? WHERE (SELECT count(*) FROM uploads WHERE member=? AND status<>'applied' AND expires>?)<2").bind(id,member,current.epoch,input.hash,input.bytes,now+86400000,member,now),
      db.prepare('INSERT INTO commit_guard VALUES(changes())'),db.prepare('DELETE FROM commit_guard'),
      db.prepare("INSERT INTO archive_imports VALUES(?,'header','',0,0,0,0,NULL)").bind(id),
    ]);return {id,next:0,status:'archive'};
  }
  const u=await db.prepare('SELECT * FROM uploads WHERE id=? AND member=? AND expires>?').bind(input.id,member,now).first<Upload>();
  const meta=await db.prepare('SELECT * FROM archive_imports WHERE id=?').bind(input.id).first<Meta>();
  if(!u||!meta)throw Error('아카이브 업로드가 없거나 만료됐습니다.');
  if((await store.read()).epoch!==u.epoch)throw Error('세계가 교체되어 아카이브를 다시 선택해야 합니다.');
  if(input.type==='finish') {
    if(u.next!==input.parts||meta.phase!=='events'||meta.chain!==u.hash||meta.events!==meta.expected)throw Error('아카이브의 순서·해시·사건 수 검증에 실패했습니다.');
    const footerBytes=new TextEncoder().encode(JSON.stringify({type:'end',hash:u.hash,parts:input.parts})+'\n').length;
    if(u.received+footerBytes!==u.bytes)throw Error('아카이브 파일 크기가 일치하지 않습니다.');
    const current=await store.read();
    if(u.status==='ready')return {id:u.id,summary:JSON.parse(u.summary!),epoch:current.epoch,revision:current.revision};
    const w=await stateFor(store,u.id);
    // Every retained engine fact must be exactly backed by the complete uploaded journal.
    for(let i=0;i<w.events.length;i+=50) {
      const subset=w.events.slice(i,i+50);
      const rows=await db.prepare("SELECT body FROM upload_events WHERE upload=? AND json_extract(body,'$.id') IN (SELECT value FROM json_each(?))").bind(u.id,JSON.stringify(subset.map(e=>e.id))).all<{body:string}>();
      const found=new Map(rows.results.map(r=>[JSON.parse(r.body).id,r.body]));
      if(subset.some(e=>found.get(e.id)!==JSON.stringify(e)))throw Error('현재 상태와 전체 원본 사건이 일치하지 않습니다.');
    }
    const summary={bytes:u.bytes,seed:w.seed,tick:w.tick,living:w.npcs.filter(n=>n.alive).length,people:w.npcs.length,events:meta.events,version:w.version};
    await db.batch([db.prepare("UPDATE uploads SET status='ready',summary=? WHERE id=? AND status='archive' AND next=?").bind(JSON.stringify(summary),u.id,u.next),db.prepare('INSERT INTO commit_guard VALUES(changes())'),db.prepare('DELETE FROM commit_guard')]);
    return {id:u.id,summary,epoch:current.epoch,revision:current.revision};
  }
  const partHash=await digestText(input.line);
  if(input.part<u.next){const prior=await db.prepare('SELECT body FROM upload_parts WHERE upload=? AND part=?').bind(u.id,input.part).first<{body:string}>();if(prior?.body!==partHash)throw Error('이미 받은 아카이브 조각과 내용이 다릅니다.');return {next:u.next};}
  if(u.status!=='archive'||input.part!==u.next)throw Error('아카이브 조각 순서를 확인해 주세요.');
  const bytes=new TextEncoder().encode(input.line+'\n').length;
  if(u.received+bytes>u.bytes)throw Error('아카이브 크기를 초과했습니다.');
  const record=JSON.parse(input.line),extra=[];
  let phase=meta.phase,expected=meta.expected,count=meta.events,last=meta.last_tick,stateBytes=meta.state_bytes,entities=meta.entities;
  if(phase==='header') {
    const header=z.object({format:z.literal(ARCHIVE_FORMAT),events:z.number().int().nonnegative().max(ARCHIVE_EVENT_LIMIT)}).strict().parse(record);
    expected=header.events;phase='state';
  } else if(phase==='state'&&record.type==='state') {
    const part=z.object({type:z.literal('state'),text:z.string().min(1).max(16000)}).strict().parse(record);
    stateBytes+=new TextEncoder().encode(part.text).length;if(stateBytes>ARCHIVE_STATE_LIMIT)throw Error('아카이브 현재 상태는 12MB까지 지원합니다.');
    extra.push(db.prepare('INSERT INTO upload_states VALUES(?,?,?)').bind(u.id,input.part,part.text));
  } else if(phase==='state'&&record.type==='state-end') {
    z.object({type:z.literal('state-end')}).strict().parse(record);
    const w=await stateFor(store,u.id);
    entities=JSON.stringify({npcs:w.npcs.map(n=>n.id),buildings:w.buildings.map(b=>b.id),reserved:[...w.npcs,...w.buildings,...w.resources,...w.loans,...w.llm.queue,...w.civilization.settlements,...w.civilization.journeys,...(w.cooperation?.projects??[])].map(v=>v.id),tick:w.tick,nextId:w.nextId} satisfies Entities);phase='events';
  } else if(phase==='events'&&record.type==='events') {
    const batch=z.object({type:z.literal('events'),events:z.array(z.unknown()).min(1).max(20)}).strict().parse(record);
    batch.events.forEach(e=>eventSchema.parse(e));const events=batch.events as WorldEvent[];
    const ent=JSON.parse(entities!) as Entities,npcs=new Set(ent.npcs),buildings=new Set(ent.buildings),reserved=new Set(ent.reserved);
    const refs=[...new Set(events.flatMap(e=>[...(e.causeId?[e.causeId]:[]),...(Array.isArray(e.data.evidence)?e.data.evidence:[])]))];
    const rows=await db.prepare("SELECT json_extract(body,'$.id') AS id FROM upload_events WHERE upload=? AND json_extract(body,'$.id') IN (SELECT value FROM json_each(?))").bind(u.id,JSON.stringify(refs)).all<{id:string}>();
    const seen=new Set(rows.results.map(r=>r.id));
    const batchIds=new Set<string>();
    for(const e of events){
      if(e.tick<last||e.tick>ent.tick||reserved.has(e.id)||batchIds.has(e.id)||/^[emqlgcj]\d+$/.test(e.id)&&Number(e.id.slice(1))>=ent.nextId||e.causeId&&!seen.has(e.causeId)||Array.isArray(e.data.evidence)&&e.data.evidence.some(id=>!seen.has(id))||e.actorId&&!npcs.has(e.actorId)||e.targetId&&!npcs.has(e.targetId)||e.locationId&&!buildings.has(e.locationId)||e.participants.some(id=>!npcs.has(id)))throw Error('아카이브 사건의 시간·ID·원인·주민 참조가 올바르지 않습니다.');
      seen.add(e.id);batchIds.add(e.id);last=e.tick;count++;
      extra.push(db.prepare('INSERT INTO upload_events VALUES(?,?,?)').bind(u.id,count,JSON.stringify(e)));
    }
    if(count>expected)throw Error('아카이브 사건 수를 초과했습니다.');
  } else throw Error('아카이브 레코드 순서가 올바르지 않습니다.');
  const chain=await digestText(meta.chain+input.line);
  await db.batch([
    db.prepare("UPDATE uploads SET next=next+1,received=received+? WHERE id=? AND next=? AND status='archive' AND expires>?").bind(bytes,u.id,input.part,now),db.prepare('INSERT INTO commit_guard VALUES(changes())'),db.prepare('DELETE FROM commit_guard'),
    ...extra,db.prepare('INSERT INTO upload_parts VALUES(?,?,?)').bind(u.id,input.part,partHash),
    db.prepare('UPDATE archive_imports SET phase=?,chain=?,events=?,expected=?,last_tick=?,state_bytes=?,entities=? WHERE id=?').bind(phase,chain,count,expected,last,stateBytes,entities,u.id),
  ]);
  return {next:input.part+1};
}
