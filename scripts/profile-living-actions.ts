import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {database} from '../tests/helpers/database';
import {WorldStore} from '../src/server/store';
import {readObserver} from '../src/server/observation';
import {streamWorld} from '../src/server/history';
import {Simulation} from '../src/sim/engine';
const db=database(),s=new WorldStore(db);await s.init(Date.now());const w=await s.read();
// Generated archive-load fixture. These are benchmark rows, never product history.
const source=new Simulation().snapshot().events[0],count=25000;
await db.batch([db.prepare('DELETE FROM participants'),db.prepare('DELETE FROM events')]);
for(let start=0;start<count;start+=250){const statements=[];for(let i=start;i<Math.min(count,start+250);i++){
 const event={...source,id:`load-${i}`,tick:36,kind:i%10===0?'construction':i%10===1?'ecology':'talk',actorId:'npc0',participants:['npc0'],importance:i%10<2?55:20,description:`조회 부하 측정용 원본 ${i} · 한글과 숫자의 직렬화 크기를 포함합니다.`,data:{phase:'completed'}};
 statements.push(db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?)').bind(w.epoch,event.id,i+1,36,event.kind,null,JSON.stringify(event)));
 statements.push(db.prepare('INSERT INTO participants VALUES(?,?,?,?)').bind(w.epoch,'npc0',event.id,i+1));
 }await db.batch(statements);}
w.meta.eventCount=count;
let archiveCalls=0,queries=0;const original=s.archive.bind(s);s.archive=()=>{archiveCalls++;const archive=original();return {prepare(sql:string){queries++;return archive.prepare(sql);},batch:archive.batch.bind(archive)} as ReturnType<typeof original>;};
const start=performance.now(),page=await readObserver(s,w,new URLSearchParams({epoch:w.epoch,from:'0',to:String(w.state.tick),through:String(count),npc:'npc0'}));const readMs=performance.now()-start;assert.equal(page.total,count);assert.ok(page.events.length<=40);assert.ok(page.changes!.every(c=>c.events.length<=2));const queryCalls={archiveCalls,queries};archiveCalls=0;queries=0;
const exportStart=performance.now(),response=streamWorld(s,w),reader=response.body!.getReader();let bytes=0,chunks=0,maxChunk=0;const parts:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;chunks++;bytes+=part.value.byteLength;maxChunk=Math.max(maxChunk,part.value.byteLength);parts.push(part.value);}
const elapsed=performance.now()-exportStart;assert.equal(archiveCalls,1);const merged=Buffer.concat(parts),parsed=JSON.parse(merged.toString());assert.equal(parsed.events.length,count);assert.equal(parsed.events[0].id,'load-0');assert.equal(parsed.events.at(-1).id,`load-${count-1}`);
writeFileSync('reports/living-actions-archive-profile.json',JSON.stringify({scope:'Local SQLite, 25000 synthetic Korean archive rows; no production CPU or memory claim',read:{ms:readMs,...queryCalls,events:page.events.length,changes:page.changes!.map(c=>({topic:c.topic,count:c.events.length}))},export:{ms:elapsed,bytes,chunks,maxChunk,archiveCalls,queries,previousOverlayCallsFromCode:queries,improvement:'Pending-event overlay is captured once instead of rebuilt for each streamed batch; event order and watermark stay pinned.'}},null,2)+'\n');
