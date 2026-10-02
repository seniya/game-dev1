import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { activeRequest, respondToRequest, updateRequests } from '../src/sim/requests';
import { emptyRequests, type RequestChoice } from '../src/sim/requests-types';
import { balance, createEconomy } from '../src/sim/economy';
import { city, urbanBalance } from '../src/sim/urban';
import { stocks } from '../src/sim/civilization';
import { compactWorld, initialWorld } from '../src/server/world';
import { WorldStore } from '../src/server/store';
import worker from '../src/server/worker';
import { database } from './helpers/database';
const valid = (w: unknown) => Simulation.load(JSON.stringify(w));
function scenario(kind: 'food'|'clothing'|'housing', population = 12) {
  const w = new Simulation(42,population).snapshot(); w.llm.enabled = false; w.requests = emptyRequests(w.tick);
  for(const n of w.npcs) { n.inventory.food = 5; w.living.people[n.id].clothing = 100; }
  const lastVillage = w.civilization.settlements.at(-1)!.id;
  const n = w.npcs.filter(n=>n.settlementId===lastVillage).sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(kind==='food') { n.inventory.food=0; n.needs.hunger=70; }
  if(kind==='clothing') { w.living.people[n.id].clothing=5; w.living.people[n.id].body.warmth=20; }
  if(kind==='housing') { w.urban.buildings[n.homeId].condition=40; w.buildings.find(b=>b.id===n.homeId)!.level=3; }
  stocks(w,n.settlementId).wood=50; stocks(w,n.settlementId).food=20;
  const c=city(w,n.settlementId); for(const good of ['cloth','clothes'] as const) { c.goods[good]+=2; w.urban.ledger.opening[good]+=2; }
  w.economy=createEconomy(w); updateRequests(w);
  const r=w.requests.items.find(r=>r.npcId===n.id && r.kind===kind)!; assert.ok(r); return {w,n,r};
}
test('first request and observed result need no AI; resources, memories and causal evidence survive continuation', () => {
  for(const seed of [42,7,123]) {
    const sim=new Simulation(seed); sim.setLLM(false); const w=sim.snapshot(), r=w.requests.items[0];
    assert.equal(r.kind,'food'); assert.equal(r.createdAt,36);
    const old=w.npcs.find(n=>n.id===r.npcId)!;
    sim.respondToRequest(r.id,'food'); const after=sim.snapshot(), supported=after.requests.items[0];
    assert.equal(after.storage.food,w.storage.food-2); assert.equal(after.npcs.find(n=>n.id===r.npcId)!.inventory.food,old.inventory.food+2);
    assert.equal(supported.immediate!.trust,supported.before.trust+4);
    assert.ok(after.npcs.find(n=>n.id===r.npcId)!.memories.some(m=>m.sourceEventId===supported.decisionEventId));
    assert.deepEqual(balance(after),{food:0,wood:0,coins:0});
    const saved=sim.save(); assert.throws(()=>sim.respondToRequest(r.id,'food'),/부탁/); assert.equal(sim.save(),saved);
    const resumed=Simulation.load(saved); sim.step(12); resumed.step(12); assert.equal(sim.save(),resumed.save());
    const result=sim.snapshot().requests.items[0]; assert.equal(result.status,'completed'); assert.ok(result.after);
    const compact=compactWorld(sim.snapshot()); valid(compact);
    assert.equal(compact.events.find(e=>e.id===result.resultEventId)!.causeId,result.decisionEventId);
    assert.equal(compact.events.find(e=>e.id===result.decisionEventId)!.causeId,result.sourceEventId);
  }
});
test('all six interventions debit actual local stock and conserve both resource ledgers', () => {
  for(const choice of ['food','farm','clothes','mend','repair','expand'] as RequestChoice[]) {
    const kind=choice==='food'||choice==='farm'?'food':choice==='clothes'||choice==='mend'?'clothing':'housing';
    const {w,n,r}=scenario(kind,72), before=structuredClone(w), local=stocks(w,n.settlementId), oldStock={...local};
    respondToRequest(w,r.id,choice); assert.equal(r.status,'observing');
    assert.equal(w.storage.food,before.storage.food); assert.equal(w.storage.wood,before.storage.wood);
    if(choice==='food') assert.equal(local.food,oldStock.food-2);
    if(['farm','repair','expand'].includes(choice)) assert.equal(local.wood,oldStock.wood-({farm:16,repair:6,expand:8}[choice as 'farm'|'repair'|'expand']));
    if(choice==='farm') assert.equal(w.buildings.length,before.buildings.length+1);
    if(choice==='repair') assert.equal(w.urban.buildings[n.homeId].condition,80);
    if(choice==='expand') assert.equal(r.immediate!.capacity,r.before.capacity+2);
    if(choice==='clothes'||choice==='mend') assert.equal(w.living.people[n.id].clothing,choice==='clothes'?100:65);
    assert.deepEqual(balance(w),{food:0,wood:0,coins:0}); assert.ok(Object.values(urbanBalance(w)).every(v=>v===0)); valid(w);
  }
});
test('invalid, stale, unaffordable and no-site choices leave all state untouched', () => {
  const {w,r}=scenario('food'); stocks(w,r.settlementId).wood=0; w.economy=createEconomy(w);
  for(const choice of ['repair','farm','unknown'] as RequestChoice[]) { const before=JSON.stringify(w); assert.throws(()=>respondToRequest(w,r.id,choice),/부탁/); assert.equal(JSON.stringify(w),before); }
  const {w:full,r:fr}=scenario('food'); full.tiles=full.tiles.map(t=>t==='grass'?'forest':t);
  const saved=JSON.stringify(full); assert.throws(()=>respondToRequest(full,fr.id,'farm'),/부지/); assert.equal(JSON.stringify(full),saved);
  const {w:moved,n,r:mr}=scenario('food'); n.homeId=moved.buildings.find(b=>b.kind==='home'&&b.id!==n.homeId)!.id;
  const old=JSON.stringify(moved); assert.throws(()=>respondToRequest(moved,mr.id,'food'),/상황/); assert.equal(JSON.stringify(moved),old);
});
test('defer once, decline, expiry and natural resolution do not give hidden bonuses or spend resources', () => {
  const {w,n,r}=scenario('food'), before={...stocks(w,r.settlementId)}, trust=w.urban.citizens[n.id].trust;
  respondToRequest(w,r.id,'later'); assert.equal(r.status,'deferred'); valid(w);
  const saved=JSON.stringify(w); assert.throws(()=>respondToRequest(w,r.id,'later')); assert.equal(JSON.stringify(w),saved);
  w.tick+=36; updateRequests(w); assert.equal(r.status,'open'); respondToRequest(w,r.id,'decline'); assert.equal(r.status,'declined');
  assert.deepEqual(stocks(w,r.settlementId),before); assert.equal(w.urban.citizens[n.id].trust,trust); valid(w);
  const natural=scenario('food'); natural.n.inventory.food+=3; natural.w.economy=createEconomy(natural.w); natural.w.tick++; updateRequests(natural.w); assert.equal(natural.r.status,'resolved'); valid(natural.w);
  const expired=scenario('food'); expired.w.tick+=432; updateRequests(expired.w); assert.equal(expired.r.status,'expired'); valid(expired.w);
});
test('version 7 migration adds no history or resources; forged request references are rejected', () => {
  const {w}=scenario('food'); const old:any=structuredClone(w); old.version=7; delete old.requests;
  const migrated=valid(old).snapshot(); assert.equal(migrated.version,9); assert.deepEqual(migrated.events,old.events); assert.deepEqual(migrated.storage,old.storage); assert.deepEqual(migrated.requests.items,[]);
  for(const change of [(x:typeof w)=>x.requests.items[0].sourceEventId='missing',(x:typeof w)=>x.requests.items[0].status='completed',(x:typeof w)=>x.requests.items[0].npcId='missing',(x:typeof w)=>x.requests.items[0].choice='repair']) {const bad=structuredClone(w); change(bad); assert.throws(()=>valid(bad),/부탁/);}
});
test('server saves once across retries, rejects stale decisions, and archives request evidence', async () => {
  const db=database(), env={TEST_AUTH:'1',DB:db,ASSETS:{fetch:()=>new Response('asset')}} as never;
  const call=(path:string,body?:unknown)=>worker.fetch(new Request(`https://world.test/api/${path}`,body?{method:'POST',headers:{Origin:'https://world.test','Content-Type':'application/json'},body:JSON.stringify(body)}:undefined),env);
  const initial=await (await call('world')).json() as ReturnType<typeof initialWorld>, r=initial.state.requests.items[0];
  const cmd={id:crypto.randomUUID(),revision:initial.revision,action:{type:'request',requestId:r.id,choice:'food'}};
  assert.equal((await call('command',cmd)).status,200); assert.equal((await call('command',cmd)).status,200);
  const store=new WorldStore(db); await store.init(0); const saved=await store.read();
  assert.equal(saved.state.storage.food,initial.state.storage.food-2); assert.equal(saved.state.requests.items[0].status,'observing');
  assert.equal((await call('command',{...cmd,id:crypto.randomUUID(),revision:saved.revision})).status,400);
  assert.equal((await call('command',{id:crypto.randomUUID(),revision:saved.revision,action:{type:'step',ticks:12}})).status,200);
  const exported=await (await call('export')).json(); const final=valid(exported).snapshot(); assert.equal(final.requests.items[0].status,'completed');
  const life:any=await (await call(`events?filter=life&npc=${r.npcId}`)).json(); assert.ok(life.events.some((e:any)=>e.kind==='request'));
});
test('30 days keep daily request caps, cooldowns, bounded history and exact saved continuation', () => {
  for(const seed of [42,7,123]) {
    let sim=new Simulation(seed); sim.setLLM(false);
    for(let i=0;i<144*30;i+=12) {
      const w=sim.snapshot();
      for(const r of w.requests.items.filter(r=>r.status==='open')) {
        const choice:RequestChoice=(i/12)%3===0?'later':r.kind==='food' && stocks(w,r.settlementId).food>=2?'food':'decline';
        try { sim.respondToRequest(r.id,choice); } catch(error) { if(!(error as Error).message.includes('이미 한 번')) throw error; sim.respondToRequest(r.id,'decline'); }
      }
      sim.step(12);
      if(i%144===0) { const snapshot=sim.snapshot(); assert.ok(snapshot.requests.items.filter(activeRequest).length<=2); assert.ok(snapshot.requests.items.length<=32); assert.deepEqual(balance(snapshot),{food:0,wood:0,coins:0}); valid(compactWorld(snapshot)); }
    }
    const final=sim.snapshot(), offers=final.events.filter(e=>e.kind==='request'&&e.data.phase==='offered'), days=new Map<number,number>(), last=new Map<string,number>();
    for(const e of offers) {const d=Math.floor(e.tick/144)+1;days.set(d,(days.get(d)??0)+1); const key=`${e.actorId}:${e.data.requestKind}`;if(last.has(key))assert.ok(e.tick-last.get(key)!>=432);last.set(key,e.tick);}
    assert.ok([...days.values()].every(n=>n<=2));assert.ok(offers.length>3);
    const continued=valid(final);sim.step(144);continued.step(144);assert.equal(sim.save(),continued.save());
  }
});
test('v7 checkpoint plus journal upgrades before new request choices and survives a store restart', async () => {
  const { stateChange } = await import('../src/server/journal');
  const { applyCommand } = await import('../src/server/world');
  const db=database(), store=new WorldStore(db); await store.init(0); const original=await store.read();
  const legacy:any=structuredClone(original.state); legacy.version=7; delete legacy.requests;
  const after=structuredClone(legacy); after.tick++;
  await db.batch([
    db.prepare('DELETE FROM snapshots'),db.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind(original.epoch,0,JSON.stringify(legacy)),
    db.prepare('UPDATE world SET revision=1 WHERE id=1'), db.prepare('UPDATE world_checkpoints SET head_revision=1'),
    db.prepare('INSERT INTO world_changes VALUES(?,?,?,?)').bind(original.epoch,1,0,JSON.stringify(stateChange(legacy,after))),
  ]);
  const fresh=new WorldStore(db), migrated=await fresh.read(); assert.equal(migrated.state.version,9); assert.equal(migrated.state.tick,after.tick); assert.deepEqual(migrated.state.requests.items,[]);
  const command={id:crypto.randomUUID(),revision:migrated.revision,action:{type:'step',ticks:12}} as const;
  const changed=await applyCommand(migrated,command,1); await fresh.commit(changed.world,changed.events,JSON.stringify(command),command.id);
  const restored=await new WorldStore(db).read(); assert.deepEqual(restored,JSON.parse(JSON.stringify(changed.world))); valid(restored.state);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM world_changes').first<{n:number}>())!.n,0);
});
