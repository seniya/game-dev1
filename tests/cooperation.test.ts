import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { cooperationDay, cooperationTick, provisionDay, prepareCandidates } from '../src/sim/cooperation';
import { capacity, startTrade } from '../src/sim/civilization';
import { balance } from '../src/sim/economy';
import { compactWorld } from '../src/server/world';
import { candidates } from '../src/sim/decision';
import { learnFromPromise, promisePreparation } from '../src/sim/promise-learning';
import { proposeGatherings, invitationPreference } from '../src/sim/gatherings';
import { liveScenes, scenesView } from '../src/ui/scenes';
import { constructionTick, workConstruction, constructionCandidate, assignConstruction } from '../src/sim/construction';
import { LegacySimulation } from '../src/server/retained/ccf7eee8ff74a40d37e0a92ad6d61fc9034753d0e425924544bba9046bab0efa';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { database } from './helpers/database';

test('resident proposes from actual crowding, waits for material and funds, donates locally, then builds through paid work',()=>{
  const w=new Simulation(42,36).snapshot();w.tick=144;
  // Rehouse the population in fewer existing homes without deleting historical buildings.
  const homes=w.buildings.filter(b=>b.kind==='home');homes.forEach(b=>b.level=1);
  assert.ok(w.npcs.length>=homes.reduce((s,b)=>s+capacity(b),0)-2);
  const stock=w.storage.wood;w.npcs[0].inventory.wood+=stock;w.storage.wood=0;
  w.npcs[0].wealth+=w.market.coins;w.market.coins=0;
  const before=balance(w);cooperationDay(w);const p=w.cooperation!.projects[0];assert.ok(p);assert.equal(p.status,'collecting');
  assert.equal(w.construction?.projects.length??0,0);assert.deepEqual(balance(w),before);
  const donor=w.npcs.find(n=>n.identity.age>=18)!;donor.personality.empathy=100;donor.needs.hunger=10;donor.position={...w.buildings.find(b=>b.kind==='market')!.position};
  const donation=Math.min(30,w.npcs[0].wealth);if(donor!==w.npcs[0]){w.npcs[0].wealth-=donation;donor.wealth+=donation;}
  cooperationTick(w);assert.ok(p.donated>0);assert.equal(p.status,'collecting');
  w.npcs[0].inventory.wood-=12;w.storage.wood+=12;
  const fund=36-w.market.coins;donor.wealth-=fund;w.market.coins+=fund;cooperationTick(w);assert.equal(p.status,'building');
  const site=w.construction!.projects.find(s=>s.id===p.siteId)!;assert.equal(site.progress,0);assert.equal(w.events.find(e=>e.id===site.source)!.causeId,p.source);
  const worker=w.npcs.find(n=>n.identity.age>=18&&n.identity.age<65)!;worker.position={...site.position};worker.needs.hunger=10;worker.needs.thirst=10;worker.needs.fatigue=10;worker.needs.health=100;delete w.urban.citizens[worker.id].employer;
  worker.currentAction={...constructionCandidate(w,worker)!,duration:4,progress:0,path:[]};assignConstruction(w,worker);w.weather='sunny';for(let i=0;i<9;i++)assert.ok(workConstruction(w,worker));constructionTick(w);cooperationTick(w);delete worker.currentAction;
  assert.equal(p.status,'completed');assert.ok(p.buildingId);assert.deepEqual(balance(w),before);
  assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));
});

test('seasonal preparation changes feasible choices only and retains measured next-day food and sources',()=>{
  const sim=new Simulation(),w=sim.snapshot();w.tick=6*144;provisionDay(w);const plan=w.cooperation!.provisions[0];assert.equal(plan.season,'가을');assert.equal(plan.target,plan.demand*3);
  const person=w.npcs.find(n=>n.identity.age>=18&&n.identity.age<65)!;person.inventory.food=2;
  const base=structuredClone(w);delete base.cooperation;
  const a=candidates(base,person),b=candidates(w,person);const harvest=b.find(c=>c.kind==='Work'&&!c.targetId?.includes(':'))!;
  assert.ok(harvest.evidence?.includes(plan.source));assert.ok(harvest.score>a.find(c=>c.targetId===harvest.targetId)!.score);
  const saved=JSON.stringify(w);prepareCandidates(w,person,[]);assert.equal(JSON.stringify(w),saved);
  const prior=plan.food;w.tick+=144;provisionDay(w);const e=w.events.at(-1)!;assert.equal(e.data.previousFood,prior);assert.equal(e.causeId,plan.source);assert.equal(e.data.food,w.cooperation!.provisions[0].food);
});

test('promise lessons are private, reason-specific, bounded and expire; successful trust is not added again',()=>{
  const w=new Simulation().snapshot();w.tick=60;for(const n of w.npcs){n.position={...w.buildings.find(b=>b.kind==='market')!.position};n.needs.hunger=10;n.needs.thirst=10;n.needs.fatigue=10;n.needs.health=100;n.inventory.food=3;delete n.currentAction;}proposeGatherings(w);
  const g=w.gatherings!.items[0],host=w.npcs.find(n=>n.id===g.hostId)!,guest=w.npcs.find(n=>n.id===g.invitations[0].npcId)!;
  const before=structuredClone(guest.relationships),normal=invitationPreference(w,guest,host,g.kind),hostMemory=host.memories.length;
  learnFromPromise(w,g,guest,g.sourceEventId);const lesson=w.events.find(e=>e.data.phase==='learning')!;
  assert.equal(promisePreparation(w,guest,host).buffer,6);assert.equal(invitationPreference(w,guest,host,g.kind),normal-2);assert.deepEqual(guest.relationships,before);assert.equal(host.memories.length,hostMemory);assert.deepEqual(lesson.participants,[guest.id]);
  w.tick+=7*144;assert.equal(promisePreparation(w,guest,host).buffer,0);
  guest.needs.health=1;learnFromPromise(w,g,guest,g.sourceEventId);assert.equal(promisePreparation(w,guest,host).buffer,0);assert.equal(promisePreparation(w,guest,host).preference,0);
});

test('observing scenes is read-only, escaped, bounded and connected to actual positions and references',()=>{
  const sim=new Simulation();sim.step(150);const w=sim.snapshot();w.npcs[0].identity.name='<img src=x onerror=alert(1)>';
  const before=JSON.stringify(w),scenes=liveScenes(w,'v0'),html=scenesView(w,'all','v0');assert.ok(scenes.length);assert.equal(JSON.stringify(w),before);assert.ok(!html.includes('<img'));assert.ok((html.match(/class="scene-card /g)??[]).length<=4);
  for(const scene of scenes){assert.ok(scene.position.x>=0);if(scene.source)assert.ok(w.events.some(e=>e.id===scene.source));}
  assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));
});

test('new rules preserve independent continuation and full accounting through a compact save',()=>{
  const sim=new Simulation(7,36);sim.setLLM(false);sim.step(144*10);const checkpoint=JSON.stringify(compactWorld(sim.snapshot())),a=Simulation.load(checkpoint),b=Simulation.load(checkpoint);a.step(288);b.step(288);assert.equal(a.save(),b.save());assert.deepEqual(balance(a.snapshot()),{food:0,wood:0,coins:0});
  const bad=JSON.parse(checkpoint);bad.cooperation.provisions[0].food++;assert.throws(()=>Simulation.load(JSON.stringify(bad)),/비축/);
});

test('published v025 pending progress is recovered by its exact engine before new rules begin',async()=>{
  const db=database(),s=new WorldStore(db);await s.init(Date.now());const saved=await s.read();
  const old=LegacySimulation.load(JSON.stringify(saved.state));old.setLLM(false);saved.state=old.snapshot() as unknown as typeof saved.state;saved.meta.aiMode='off';
  await db.batch([db.prepare('DELETE FROM snapshots'),...s.snapshotStatements(saved.epoch,saved.state),db.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
  old.step(144,undefined);const expected=old.snapshot() as unknown as typeof saved.state,added=expected.events.filter(e=>!saved.state.events.some(p=>p.id===e.id));
  await db.batch([db.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:'ccf7eee8ff74a40d37e0a92ad6d61fc9034753d0e425924544bba9046bab0efa',epoch:saved.epoch,ticks:144,meta:{...saved.meta,eventCount:saved.meta.eventCount+added.length},started:Date.now(),id:'v025-recovery'}))]);
  const restored=await new LiveWorldStore(db,'v026').read();assert.deepEqual(restored.state,JSON.parse(JSON.stringify(compactWorld(expected))));assert.equal(restored.state.cooperation,undefined);assert.equal(restored.meta.aiMode,'off');
  const next=Simulation.load(JSON.stringify(restored.state));next.step(144);assert.ok(next.snapshot().cooperation);assert.deepEqual(balance(next.snapshot()),{food:0,wood:0,coins:0});
});
