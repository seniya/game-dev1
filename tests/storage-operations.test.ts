import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers/database';
import { WorldStore, Conflict } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { applyCommand, commandSchema, type Command } from '../src/server/world';
import { storageStatus, storageLevel } from '../src/server/storage-status';
import { inspectSave, SERVER_IMPORT_BYTES } from '../src/sim/save-inspection';
import { Simulation } from '../src/sim/engine';
import { streamWorld } from '../src/server/history';
import worker from '../src/server/worker';
const now = 1_800_000_000_000;
async function setup() { const db = database(), store = new LiveWorldStore(db); await store.init(now); return { db, store }; }
async function send(store: LiveWorldStore, action: Command['action'], at = now) {
  const before = await store.read(), c = { id: crypto.randomUUID(), revision: before.revision, action };
  const next = action.type === 'restore-backup' ? { world: await store.restoreBackup(before, c, at), events: [] } : await applyCommand(before, c, at);
  await store.commit(next.world, next.events, c.id, c.id, [], { action, at }); return next.world;
}

test('inspection validates references and enforces UTF-8 bytes rather than JS characters', () => {
  const save = JSON.stringify(new Simulation(42, 12).snapshot());
  const result = inspectSave(save); assert.equal(result.living, 12); assert.equal(result.bytes, new TextEncoder().encode(save).length);
  assert.throws(() => inspectSave('{"version":9}'));
  const oversized = '가'.repeat(Math.ceil(SERVER_IMPORT_BYTES / 3));
  assert.ok(oversized.length < SERVER_IMPORT_BYTES);
  assert.throws(() => inspectSave(oversized), /UTF-8/);
  assert.equal(commandSchema.safeParse({ id: crypto.randomUUID(), revision: 0, action: { type: 'import', save: oversized } }).success, false);
});

test('storage inspection measures exact export bytes without committing or replaying pending progress', async () => {
  const { db, store } = await setup();
  await send(store, { type: 'ai-mode', mode: 'off' }); await send(store, { type: 'play', running: true });
  const before = await new WorldStore(db).read();
  await store.sync({id:crypto.randomUUID(),revision:before.revision,action:{type:'sync'}},now+2000);
  const rows = await db.prepare('SELECT * FROM world_live').all();
  const report = await storageStatus(new WorldStore(db));
  assert.equal(report.pendingTicks, 2); assert.equal(report.worlds[0].tick, before.state.tick);
  const exported = await streamWorld(new WorldStore(db), before).arrayBuffer();
  assert.equal(report.worlds[0].exportBytes, exported.byteLength);
  assert.deepEqual(await db.prepare('SELECT * FROM world_live').all(), rows);
  assert.deepEqual(await new WorldStore(db).read(), before);
  assert.equal(storageLevel(99_999_999),'normal'); assert.equal(storageLevel(100_000_000),'notice'); assert.equal(storageLevel(500_000_000),'warning');
});

test('backup restore swaps existing archives and preserves live predecessor, creator and personal records', async () => {
  const { db, store } = await setup();
  const first = await send(store, { type:'step',ticks:12 });
  const full = await store.export(first.epoch);
  await db.batch([
    db.prepare("INSERT INTO npc_creators VALUES(?,'npc0','guest','example')").bind(first.epoch),
    db.prepare("INSERT INTO personal_observations VALUES(?,'guest','[\"npc0\"]',0,0,1)").bind(first.epoch),
  ]);
  let second = await send(store,{type:'reset',seed:7});
  await send(store,{type:'ai-mode',mode:'off'}); second = await send(store,{type:'play',running:true});
  await store.sync({id:crypto.randomUUID(),revision:second.revision,action:{type:'sync'}},now+2000);
  const prior = JSON.parse(JSON.stringify(await store.export(second.epoch)));
  const restored = await send(store,{type:'restore-backup',epoch:first.epoch},now+2001);
  assert.equal(restored.epoch,first.epoch); assert.equal(restored.meta.running,false); assert.equal(restored.meta.aiMode,'mock');
  assert.deepEqual(await store.export(first.epoch),full);
  assert.deepEqual(await store.export(second.epoch),prior);
  assert.equal(restored.meta.backupEpoch,second.epoch); assert.equal(restored.meta.backupEventCount,prior.events.length);
  assert.ok(await db.prepare('SELECT * FROM npc_creators WHERE epoch=?').bind(first.epoch).first());
  assert.ok(await db.prepare('SELECT * FROM personal_observations WHERE epoch=?').bind(first.epoch).first());
  const undo = await send(store,{type:'restore-backup',epoch:second.epoch},now+2002);
  assert.equal(undo.meta.aiMode,'off'); assert.deepEqual(await store.export(second.epoch),prior);
});

test('large archive backup is restored without selecting event bodies into Worker memory', async () => {
  const { db, store } = await setup();
  const initial = await store.read();
  const padding = '가'.repeat(1000), n = 3500;
  const events = Array.from({length:n},(_,i)=>({id:`large-${i}`,tick:0,kind:'weather' as const,participants:[],importance:1,description:padding,data:{}}));
  await db.batch(store.eventStatements(initial.epoch,events,initial.meta.eventCount));
  // Model a larger valid archive while keeping the execution checkpoint compact.
  initial.meta.eventCount += n;
  await db.batch([db.prepare('UPDATE world SET meta=? WHERE id=1').bind(JSON.stringify(initial.meta))]);
  await send(store,{type:'reset',seed:7});
  const report = await storageStatus(new WorldStore(db));
  assert.ok(report.worlds[1].exportBytes > SERVER_IMPORT_BYTES); assert.equal(report.worlds[1].fileImportFits,false);
  const read = db.prepare.bind(db); const queries: string[]=[];
  db.prepare = (sql: string) => { queries.push(sql); return read(sql); };
  const restored = await send(store,{type:'restore-backup',epoch:initial.epoch});
  assert.equal(restored.meta.eventCount,initial.meta.eventCount);
  assert.equal(queries.some(q=>/SELECT body FROM events/.test(q)),false);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM events WHERE epoch=?').bind(initial.epoch).first<{n:number}>())!.n,initial.meta.eventCount);
});

test('missing archive or stale backup selection leaves current world unchanged', async () => {
  const { db, store } = await setup();
  const first = await send(store,{type:'step',ticks:12});
  const current = await send(store,{type:'reset',seed:7});
  await assert.rejects(send(store,{type:'restore-backup',epoch:'unrelated'}),/변경/);
  await db.batch([db.prepare('DELETE FROM events WHERE epoch=? AND seq=1').bind(first.epoch)]);
  await assert.rejects(send(store,{type:'restore-backup',epoch:first.epoch}),/누락/);
  assert.deepEqual(await store.read(),current);
});

test('concurrent restore cannot overwrite a newer live clock and failed transaction keeps both worlds', async()=>{
  const {db,store}=await setup(); const first=await store.read(); await send(store,{type:'reset',seed:7});
  await send(store,{type:'play',running:true});
  const stale=new LiveWorldStore(db),current=await stale.read(), action={type:'restore-backup',epoch:first.epoch} as const;
  const command={id:crypto.randomUUID(),revision:current.revision,action};
  const proposed=await stale.restoreBackup(current,command,now+1);
  await store.sync({id:crypto.randomUUID(),revision:current.revision,action:{type:'sync'}},now+2000);
  const latest=await new LiveWorldStore(db).read();
  await assert.rejects(stale.commit(proposed,[],command.id,command.id,[],{action,at:now+2001}),Conflict);
  assert.deepEqual(await new LiveWorldStore(db).read(),latest);
  assert.equal(await store.command(command.id),null);
  assert.ok(await store.checkpoint(first.epoch));
});

test('owner-only diagnostics and restore use normal retry and authorization rules',async()=>{
  const {db}=await setup(),env={DB:db,SITE_OWNER_EMAIL:'owner@example.test',ASSETS:{fetch:()=>new Response('asset')}} as never;
  const call=(who:string,path:string,body?:unknown)=>worker.fetch(new Request(`https://world.test/api/${path}`,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':`${who}@example.test`,Origin:'https://world.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
  let world=await(await call('owner','world')).json(); const epoch=world.epoch;
  world=await(await call('owner','command',{id:crypto.randomUUID(),revision:world.revision,action:{type:'reset',seed:7}})).json();
  assert.equal((await call('guest','storage')).status,403);
  const command={id:crypto.randomUUID(),revision:world.revision,action:{type:'restore-backup',epoch}};
  assert.equal((await call('guest','command',command)).status,403);
  const first=await call('owner','command',command); assert.equal(first.status,200); const restored=await first.json();
  assert.equal((await call('owner','command',command)).status,200);
  assert.equal((await(await call('owner','world')).json()).revision,restored.revision);
  assert.equal((await call('owner','storage')).status,200);
});
