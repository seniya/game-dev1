import { TURN_KINDS, type BiographyMode, type BiographyPage, type LifeChapter } from '../sim/biography';
import type { WorldEvent } from '../sim/types';
import type { WorldStore } from './store';
import type { StoredWorld } from './world';

export async function readBiography(store:WorldStore,current:StoredWorld,p:URLSearchParams):Promise<BiographyPage> {
  const npc=p.get('npc')??'', mode=(p.get('mode')??'turns') as BiographyMode, root=p.get('root'), partner=p.get('partner');
  if(p.get('epoch')!==current.epoch)throw new Error('세계가 바뀌었습니다. 이야기를 다시 열어 주세요.');
  if(!current.state.npcs.some(n=>n.id===npc)||!['turns','threads','shared'].includes(mode)||root&&root.length>100||partner&&(partner===npc||!current.state.npcs.some(n=>n.id===partner)))throw new Error('이야기의 주민과 조회 조건을 확인해 주세요.');
  const number=(key:string,fallback:number,max:number)=>{const n=p.has(key)?Number(p.get(key)):fallback;if(!Number.isSafeInteger(n)||n<0||n>max)throw new Error('이야기 페이지가 올바르지 않습니다.');return n;};
  const through=number('through',current.meta.eventCount,current.meta.eventCount),before=number('before',through+1,through+1);
  const db=store.archive(), clauses=['e.epoch=?','e.seq<=?','e.seq<?','EXISTS(SELECT 1 FROM participants p WHERE p.epoch=e.epoch AND p.event=e.id AND p.npc=?)'];
  const args:(string|number)[]=[current.epoch,through,before,npc];
  if(partner){clauses.push('EXISTS(SELECT 1 FROM participants q WHERE q.epoch=e.epoch AND q.event=e.id AND q.npc=?)');args.push(partner);}
  if(root){
    const source=await db.prepare('SELECT body FROM events WHERE epoch=? AND id=? AND seq<=?').bind(current.epoch,root,through).first<{body:string}>();
    if(!source)throw new Error('이 주민의 시작 기록을 찾을 수 없습니다.');
    const event=JSON.parse(source.body) as WorldEvent,match=['e.id=?','e.cause=?'],rootArgs:(string|number)[]=[root,root];
    for(const key of ['requestId','gatheringId'])if(typeof event.data[key]==='string'){match.push(`json_extract(e.body,'$.data.${key}')=?`);rootArgs.push(event.data[key]);}
    const involved=await db.prepare(`SELECT e.id FROM events e JOIN participants p ON p.epoch=e.epoch AND p.event=e.id WHERE e.epoch=? AND e.seq<=? AND p.npc=? AND (${match.join(' OR ')}) LIMIT 1`).bind(current.epoch,through,npc,...rootArgs).first();
    if(!involved)throw new Error('이 주민과 연결된 기록이 아닙니다.');
    // Once participation is established, the observer can follow the whole
    // appointment, including the host's proposal and final cancellation.
    clauses[3]='1=1';args.splice(3,1);args.push(...rootArgs);
    clauses.push(`(${match.join(' OR ')})`);
  }
  else if(mode==='turns'){clauses.push(`e.kind IN (${TURN_KINDS.map(()=>'?').join(',')}) AND (e.kind<>'arrival' OR json_extract(e.body,'$.importance')>=45)`);args.push(...TURN_KINDS);}
  else if(mode==='threads'){
    clauses[3]="(EXISTS(SELECT 1 FROM participants p WHERE p.epoch=e.epoch AND p.event=e.id AND p.npc=?) OR e.kind='gathering' AND EXISTS(SELECT 1 FROM events g JOIN participants p ON p.epoch=g.epoch AND p.event=g.id WHERE g.epoch=e.epoch AND g.seq<=? AND json_extract(g.body,'$.data.gatheringId')=json_extract(e.body,'$.data.gatheringId') AND p.npc=?))";
    args.splice(4,0,through,npc);
    clauses.push("(e.kind IN ('loan','goal') OR e.kind='request' AND json_extract(e.body,'$.data.phase')='offered' OR e.kind='gathering' AND json_extract(e.body,'$.data.phase')='proposed')");
  }
  else {
    clauses.push("e.kind IN ('talk','share','loan','repayment','default','family','birth','death','inheritance','gathering','migration')");
    clauses.push("(e.kind<>'gathering' OR json_extract(e.body,'$.data.phase')='completed')");
    clauses.push('EXISTS(SELECT 1 FROM npc_creators a JOIN npc_creators b ON a.epoch=b.epoch AND a.member<>b.member JOIN participants p2 ON p2.epoch=b.epoch AND p2.npc=b.npc WHERE a.epoch=e.epoch AND a.npc=? AND p2.event=e.id)');args.push(npc);
  }
  const rows=await db.prepare(`SELECT e.body,e.seq FROM events e WHERE ${clauses.join(' AND ')} ORDER BY e.seq DESC LIMIT 13`).bind(...args).all<{body:string;seq:number}>();
  const chapters:LifeChapter[]=[];
  for(const row of rows.results.slice(0,12)) {
    const e=JSON.parse(row.body) as WorldEvent, match=['e.cause=?'], values:(string|number)[]=[current.epoch,through,e.id,e.id];
    if(root){chapters.push({event:e,after:[],more:false});continue;}
    for(const key of ['requestId','gatheringId'])if(typeof e.data[key]==='string'){match.push(`json_extract(e.body,'$.data.${key}')=?`);values.push(e.data[key]);}
    const [prior,after]=await Promise.all([
      e.causeId?db.prepare('SELECT body FROM events WHERE epoch=? AND seq<=? AND id=?').bind(current.epoch,through,e.causeId).first<{body:string}>():null,
      db.prepare(`SELECT e.body FROM events e WHERE e.epoch=? AND e.seq<=? AND e.id<>? AND (${match.join(' OR ')}) ORDER BY e.seq DESC LIMIT 7`).bind(...values).all<{body:string}>(),
    ]);
    chapters.push({event:e,...(prior?{before:JSON.parse(prior.body)}:{}),after:after.results.slice(0,6).map(r=>JSON.parse(r.body) as WorldEvent).reverse(),more:after.results.length>6});
  }
  return {epoch:current.epoch,npc,mode,through,next:rows.results.length>12?rows.results[11].seq:null,chapters};
}
