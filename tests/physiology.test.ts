import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { newPhysique, effectiveResistance, physiologyDay } from '../src/sim/physiology';
import { relationship } from '../src/sim/social';
import { formFamily, giveBirth, lifeDay, shareAffection } from '../src/sim/life';
import { createCharacter } from '../src/sim/characters';
import { defaultCharacter } from '../src/ui/characters';
import { YEAR_TICKS } from '../src/sim/types';
import { createEconomy, balance } from '../src/sim/economy';
import { urbanDay } from '../src/sim/urban';
function pair() {
  const w=new Simulation().snapshot(),[a,b]=w.npcs;w.llm.enabled=false;w.tick=YEAR_TICKS*2+36;
  for(const n of [a,b]){n.identity.age=25;n.life.bornTick=w.tick-25*YEAR_TICKS;n.needs.health=100;n.needs.hunger=10;n.inventory.food=20;}
  a.physique!.sex='male';b.physique!.sex='female';
  for(const [n,p] of [[a,b],[b,a]])Object.assign(relationship(n,p.id),{affection:70,trust:80});
  w.economy=createEconomy(w);return {w,a,b};
}
test('legacy residents gain stable physique without changing world history, RNG or spouses',()=>{
  const {w,a,b}=pair();assert.ok(formFamily(w,a,b));for(const n of w.npcs)delete n.physique;
  const before=JSON.stringify(w),first=Simulation.load(before),second=Simulation.load(before);assert.equal(first.save(),second.save());
  const migrated=first.snapshot();assert.equal(migrated.rng,w.rng);assert.deepEqual(migrated.events,w.events);
  assert.equal(migrated.npcs[0].life.partnerId,b.id);assert.notEqual(migrated.npcs[0].physique!.sex,migrated.npcs[1].physique!.sex);
  const next=Simulation.load(first.save());first.step(144);next.step(144);assert.equal(first.save(),next.save());
});
test('creation validates and persists sex and physical attributes; child defaults follow age',()=>{
  const w=new Simulation().snapshot(),input={...defaultCharacter('b4'),sex:'female' as const,heightCm:168.5,weightKg:58.2,diseaseResistance:77};
  const n=createCharacter(w,input);assert.equal(n.physique!.heightCm,168.5);assert.equal(n.physique!.sex,'female');assert.equal(n.physique!.diseaseResistance,77);
  assert.deepEqual(Simulation.load(JSON.stringify(w)).snapshot().npcs.at(-1)!.physique,n.physique);
  const baby=newPhysique(42,'baby',0);assert.ok(baby.heightCm<60 && baby.weightKg<5);
  for(const change of [{sex:'other'},{heightCm:Infinity},{weightKg:-1},{diseaseResistance:101}]) {
    const saved=JSON.stringify(w);assert.throws(()=>createCharacter(w,{...input,...change} as typeof input));assert.equal(JSON.stringify(w),saved);
  }
  const bad=structuredClone(w);bad.npcs[0].physique!.weightKg=-2;assert.throws(()=>Simulation.load(JSON.stringify(bad)));
});
test('mutual adult affection produces a traceable affection → family → birth chain and inherited body',()=>{
  const {w,a,b}=pair();assert.ok(formFamily(w,a,b));const family=w.events.find(e=>e.kind==='family')!;
  assert.equal(w.events.find(e=>e.id===family.causeId)!.data.romanticAffection,true);
  const count=w.events.length;assert.ok(shareAffection(w,a,b));assert.equal(w.events.length,count);
  const child=giveBirth(w,a,b)!;assert.ok(child);assert.ok(child.physique!.heightCm<65 && child.physique!.weightKg<5);assert.ok(child.physique!.diseaseResistance>=0);
  assert.equal(w.events.find(e=>e.id===child.life.birthEventId)!.causeId,family.id);
  assert.deepEqual(balance(w),{food:0,wood:0,coins:0});Simulation.load(JSON.stringify(w));
});
test('one-sided affection, fear, resentment, minors, relatives and unavailable partners cannot form a romantic family',()=>{
  for(const mutate of [
    ({b}:ReturnType<typeof pair>)=>b.identity.age=17,
    ({a,b}:ReturnType<typeof pair>)=>b.physique!.sex=a.physique!.sex,
    ({a,b}:ReturnType<typeof pair>)=>relationship(b,a.id).affection=59,
    ({a,b}:ReturnType<typeof pair>)=>relationship(b,a.id).trust=59,
    ({a,b}:ReturnType<typeof pair>)=>relationship(b,a.id).fear=25,
    ({a,b}:ReturnType<typeof pair>)=>relationship(b,a.id).resentment=25,
    ({a,b}:ReturnType<typeof pair>)=>b.life.parentIds=[a.id],
    ({b}:ReturnType<typeof pair>)=>b.life.partnerId='npc3',
  ]){const f=pair();mutate(f);const count=f.w.events.length;assert.equal(formFamily(f.w,f.a,f.b),false);assert.equal(shareAffection(f.w,f.a,f.b),undefined);assert.equal(f.w.events.length,count);}
});
test('a strong but incompatible first candidate cannot block another reciprocal match',()=>{
  const {w,a,b}=pair(),c=w.npcs[2];c.physique!.sex=a.physique!.sex;relationship(a,c.id).affection=100;relationship(a,c.id).trust=100;
  lifeDay(w);assert.equal(a.life.partnerId,b.id);
});
test('existing spouses stop romantic expression and births when affection becomes one-sided',()=>{
  const {w,a,b}=pair();assert.ok(formFamily(w,a,b));relationship(b,a.id).affection=0;
  assert.equal(shareAffection(w,a,b),undefined);assert.equal(giveBirth(w,a,b),undefined);assert.equal(a.life.partnerId,b.id);
});
test('children grow, undernourished residents lose weight and resistance changes with condition',()=>{
  const w=new Simulation().snapshot(),n=w.npcs[9];const before=n.physique!.heightCm;w.tick+=YEAR_TICKS;physiologyDay(w,n);assert.ok(n.physique!.heightCm>before);
  const weight=n.physique!.weightKg;n.needs.hunger=90;w.urban.citizens[n.id].nutrition=20;physiologyDay(w,n);assert.ok(n.physique!.weightKg<weight);
  n.needs.fatigue=0;const low=effectiveResistance(w,n);w.urban.citizens[n.id].nutrition=100;assert.ok(effectiveResistance(w,n)>low);
});
test('disease resistance changes actual recovery and pollution-related infection risk',()=>{
  const w=new Simulation().snapshot();w.tick=144;
  for(const n of w.npcs){w.urban.citizens[n.id].disease=8;n.physique!.diseaseResistance=0;}
  const strong=structuredClone(w);for(const n of strong.npcs)n.physique!.diseaseResistance=100;
  urbanDay(w);urbanDay(strong);assert.ok(strong.urban.citizens.npc0.disease<w.urban.citizens.npc0.disease);
  let weakCases=0,strongCases=0;
  for(let seed=1;seed<=24;seed++){
    const weak=new Simulation(seed,72).snapshot();weak.tick=144;
    for(const n of weak.npcs)n.physique!.diseaseResistance=0;
    for(const c of weak.urban.cities)c.pollution=100;
    const high=structuredClone(weak);for(const n of high.npcs)n.physique!.diseaseResistance=100;
    urbanDay(weak);urbanDay(high);
    weakCases+=weak.npcs.filter(n=>weak.urban.citizens[n.id].disease>0).length;strongCases+=high.npcs.filter(n=>high.urban.citizens[n.id].disease>0).length;
  }
  assert.ok(weakCases>strongCases,`${weakCases} > ${strongCases}`);
});
test('published v0.32 pending ticks are recovered before physique migration, preserving epoch and history',async()=>{
  const {database}=await import('./helpers/database');const {WorldStore}=await import('../src/server/store');const {LiveWorldStore}=await import('../src/server/live-store');const {compactWorld}=await import('../src/server/world');
  const fingerprint='e0336875e586fa21410fd6838be6151e01a842146dd9c96445f15ab69ce3d7d7';
  const {retainedEngine}=await import('../src/server/engine-registry');const {LegacySimulation}=await retainedEngine(fingerprint)!();
  const db=database(),store=new WorldStore(db);await store.init(Date.now());const saved=await store.read();const sim=new LegacySimulation(42,12);sim.setLLM(false);
  saved.state=sim.snapshot() as unknown as typeof saved.state;saved.meta.aiMode='off';saved.meta.eventCount=saved.state.events.length;
  await db.batch([db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),...store.snapshotStatements(saved.epoch,saved.state),db.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
  sim.step(150,undefined);const state=sim.snapshot() as unknown as typeof saved.state,ids=new Set(saved.state.events.map(e=>e.id));
  const meta={...saved.meta,eventCount:saved.meta.eventCount+state.events.filter(e=>!ids.has(e.id)).length};
  await db.batch([db.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:fingerprint,epoch:saved.epoch,ticks:150,meta,started:Date.now(),id:crypto.randomUUID()}))]);
  const recovered=await new LiveWorldStore(db,'physiology-test').read();assert.equal(recovered.epoch,saved.epoch);assert.deepEqual(recovered.state,JSON.parse(JSON.stringify(compactWorld(state))));
  assert.equal(await db.prepare('SELECT * FROM world_live').first(),null);
  const migrated=Simulation.load(JSON.stringify(recovered.state)).snapshot();assert.ok(migrated.npcs.every(n=>n.physique));assert.deepEqual(migrated.events,recovered.state.events);
});
