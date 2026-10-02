import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveRecords, digestText } from '../src/shared/archive';
import { archiveUpload } from '../src/server/archive-upload';
import { prepareUpload } from '../src/server/uploads';
import { WorldStore } from '../src/server/store';
import { compactWorld } from '../src/server/world';
import { Simulation } from '../src/sim/engine';
import { appendEvent } from '../src/sim/social';
import { database } from './helpers/database';
import { streamArchive } from '../src/server/history';
import type { WorldState } from '../src/sim/types';

async function file(w:WorldState){async function* events(){yield* w.events;}let text='';for await(const line of archiveRecords(compactWorld(w),events(),w.events.length))text+=line;const lines=text.trimEnd().split('\n');return {text,lines,footer:JSON.parse(lines.pop()!)};}
async function setup(){const store=new WorldStore(database());await store.init(Date.now());return store;}
test('archive resumes, rejects changed duplicate parts, verifies all sources, previews without replacing and applies atomically',async()=>{
  const s=await setup(),before=await s.read(),sim=new Simulation(7);sim.step(144);const w=sim.snapshot(),f=await file(w),start={type:'start',hash:f.footer.hash,bytes:Buffer.byteLength(f.text)},u=await archiveUpload(s,'owner',start) as {id:string;next:number};
  await archiveUpload(s,'owner',{type:'record',id:u.id,part:0,line:f.lines[0]});
  assert.equal((await archiveUpload(s,'owner',start) as {next:number}).next,1);
  await archiveUpload(s,'owner',{type:'record',id:u.id,part:0,line:f.lines[0]});
  await assert.rejects(archiveUpload(s,'owner',{type:'record',id:u.id,part:0,line:f.lines[0]+' '}),/다릅니다/);
  await assert.rejects(archiveUpload(s,'stranger',{type:'record',id:u.id,part:1,line:f.lines[1]}),/만료/);
  for(let part=1;part<f.lines.length;part++)await archiveUpload(s,'owner',{type:'record',id:u.id,part,line:f.lines[part]});
  const result=await archiveUpload(s,'owner',{type:'finish',id:u.id,parts:f.footer.parts}) as {summary:{events:number}};assert.equal(result.summary.events,w.events.length);assert.deepEqual(await s.read(),before);
  const prepared=await prepareUpload(s,before,'owner',u.id,'archive-test',Date.now());await s.commit(prepared.world,prepared.events,'archive-test','archive-test',prepared.extra);
  const after=await s.read();assert.equal(after.state.seed,7);assert.equal(after.meta.running,false);assert.equal(after.meta.backupEpoch,before.epoch);
  const restored=await s.export(after.epoch);assert.deepEqual(restored.events,JSON.parse(JSON.stringify(w.events)));assert.deepEqual(compactWorld(restored),JSON.parse(JSON.stringify(compactWorld(w))));
  await assert.rejects(prepareUpload(s,after,'owner',u.id,'again',Date.now()),/확인/);
  const download=await streamArchive(s,after).text();assert.equal(JSON.parse(download.trim().split('\n')[0]).format,'lsw-archive-1');
});

test('an archive larger than 24MB validates in bounded records and restores its entire journal',async()=>{
  const s=await setup(),before=await s.read(),w=new Simulation().snapshot();
  for(let i=0;i<5300;i++)appendEvent(w,{kind:'weather',importance:10,description:'실제 저장 크기 검사',data:{padding:'a'.repeat(5000)}});
  const f=await file(w);assert.ok(Buffer.byteLength(f.text)>24_000_000);
  const u=await archiveUpload(s,'owner',{type:'start',hash:f.footer.hash,bytes:Buffer.byteLength(f.text)}) as {id:string};
  for(let part=0;part<f.lines.length;part++)await archiveUpload(s,'owner',{type:'record',id:u.id,part,line:f.lines[part]});
  const ready=await archiveUpload(s,'owner',{type:'finish',id:u.id,parts:f.footer.parts}) as {summary:{events:number}};assert.equal(ready.summary.events,w.events.length);
  const prepared=await prepareUpload(s,before,'owner',u.id,'large',Date.now());await s.commit(prepared.world,[],'large','large',prepared.extra);
  const count=await s.db.prepare('SELECT count(*) AS n FROM events WHERE epoch=?').bind(u.id).first<{n:number}>();assert.equal(count!.n,w.events.length);
  assert.equal((await s.read()).state.events.length,compactWorld(w).events.length);
});

test('archive rejects missing causes, changed retained facts, incomplete files and world changes',async()=>{
  const s=await setup(),w=new Simulation().snapshot(),f=await file(w);
  const u=await archiveUpload(s,'owner',{type:'start',hash:f.footer.hash,bytes:Buffer.byteLength(f.text)}) as {id:string};
  await assert.rejects(archiveUpload(s,'owner',{type:'finish',id:u.id,parts:f.footer.parts}),/검증/);
  const eventPart=f.lines.findIndex(l=>JSON.parse(l).type==='events');
  for(let part=0;part<eventPart;part++)await archiveUpload(s,'owner',{type:'record',id:u.id,part,line:f.lines[part]});
  const bad=JSON.parse(f.lines[eventPart]);bad.events[0].causeId='e999999';
  await assert.rejects(archiveUpload(s,'owner',{type:'record',id:u.id,part:eventPart,line:JSON.stringify(bad)}),/참조/);
  assert.equal((await s.db.prepare('SELECT count(*) AS n FROM upload_events WHERE upload=?').bind(u.id).first<{n:number}>())!.n,0);
  await s.db.batch([s.db.prepare('UPDATE world SET epoch=?').bind('changed')]);
  await assert.rejects(archiveUpload(s,'owner',{type:'record',id:u.id,part:eventPart,line:f.lines[eventPart]}),/세계/);
});

test('a recomputed valid file hash cannot hide a changed retained event, and wrong hashes never become ready',async()=>{
  const s=await setup(),w=new Simulation().snapshot(),f=await file(w);
  const at=f.lines.findIndex(l=>JSON.parse(l).type==='events'),changed=JSON.parse(f.lines[at]);changed.events[0].description='변조한 근거';f.lines[at]=JSON.stringify(changed);
  let hash='';for(const line of f.lines)hash=await digestText(hash+line);
  const footer={type:'end',hash,parts:f.lines.length},text=f.lines.concat(JSON.stringify(footer)).join('\n')+'\n';
  const u=await archiveUpload(s,'owner',{type:'start',hash,bytes:Buffer.byteLength(text)}) as {id:string};
  for(let part=0;part<f.lines.length;part++)await archiveUpload(s,'owner',{type:'record',id:u.id,part,line:f.lines[part]});
  await assert.rejects(archiveUpload(s,'owner',{type:'finish',id:u.id,parts:f.lines.length}),/원본 사건/);
  await s.db.batch([s.db.prepare('UPDATE uploads SET hash=? WHERE id=?').bind('0'.repeat(64),u.id)]);
  await assert.rejects(archiveUpload(s,'owner',{type:'finish',id:u.id,parts:f.lines.length}),/해시/);
  assert.equal((await s.read()).state.seed,42);
});
