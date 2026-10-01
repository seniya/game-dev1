import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Simulation, summarize } from './sim/engine';
import { balance } from './sim/economy';
import { urbanBalance } from './sim/urban';
import { compactWorld } from './server/world';
import { requestOptions, activeRequest, pendingFollowup } from './sim/requests';
import type { WorldEvent } from './sim/types';
const results: unknown[]=[];
const started=Date.now();
for(const seed of [7,42,123]) for(const support of [false,true]) {
  const dir=mkdtempSync(`${tmpdir()}/lsw-observation-`), db=new DatabaseSync(`${dir}/events.sqlite`);
  db.exec('CREATE TABLE events(id TEXT PRIMARY KEY,tick INTEGER,kind TEXT,body TEXT); CREATE TABLE refs(source TEXT,target TEXT);');
  const insert=db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?)'),ref=db.prepare('INSERT INTO refs VALUES(?,?)');
  let sim=new Simulation(seed,12);sim.setLLM(false);
  let archived=new Set<string>(), offers=0, repeats=0, followups=0, peakBytes=0, peakRequests=0, peakUnmetFood=0;
  const lastOffer=new Map<string,number>(), dayOffers=new Map<number,number>(), deathReasons:Record<string,number>={};
  const stagnant=new Map<string,{key:string;since:number}>(); let maximumStall=0;
  const archive=(events:WorldEvent[])=>{
    db.exec('BEGIN');
    for(const e of events) {
      if(archived.has(e.id)) continue;
      const inserted=insert.run(e.id,e.tick,e.kind,JSON.stringify(e));if(!inserted.changes)continue;
      for(const target of [...(e.causeId?[e.causeId]:[]),...(Array.isArray(e.data.evidence)?e.data.evidence:[])])ref.run(e.id,target);
      if(e.kind==='request'&&e.data.phase==='offered') {
        offers++;const key=`${e.actorId}:${e.data.requestKind}`,last=lastOffer.get(key);
        if(last!==undefined){assert.ok(e.tick-last>=432);repeats++;}lastOffer.set(key,e.tick);
        const day=Math.floor(e.tick/144);dayOffers.set(day,(dayOffers.get(day)??0)+1);assert.ok(dayOffers.get(day)!<=2);
      }
      if(e.kind==='request'&&e.data.phase==='followup')followups++;
      if(e.kind==='death'){const reason=String(e.data.reason);deathReasons[reason]=(deathReasons[reason]??0)+1;}
    }
    db.exec('COMMIT');
  };
  archive(sim.snapshot().events);
  for(let day=1;day<=365;day++) {
    for(let hour=0;hour<12;hour++) {
      if(support) {
        const w=sim.snapshot();
        for(const r of w.requests.items.filter(r=>r.status==='open')) {
          const option=requestOptions(w,r).find(o=>!o.disabled&&!['later','decline','farm'].includes(o.choice));
          sim.respondToRequest(r.id,option?.choice??'decline');
        }
      }
      sim.step(12);
    }
    const w=sim.snapshot();archive(w.events);
    assert.deepEqual(balance(w),{food:0,wood:0,coins:0});assert.ok(Object.values(urbanBalance(w)).every(x=>x===0));
    assert.ok(w.requests.items.filter(activeRequest).length<=2);assert.ok(w.requests.items.length<=32);
    for(const r of w.requests.items.filter(pendingFollowup)) assert.ok(r.followupSince!==undefined);
    peakRequests=Math.max(peakRequests,w.requests.items.length);peakUnmetFood=Math.max(peakUnmetFood,w.npcs.filter(n=>n.alive&&n.needs.hunger>75&&n.inventory.food===0).length);
    for(const n of w.npcs.filter(n=>n.alive)) {
      const a=n.currentAction;if(!a){stagnant.delete(n.id);continue;}
      const key=JSON.stringify([a.kind,a.targetId,a.progress,a.path.length,n.position,n.decision.tick]);
      const prior=stagnant.get(n.id);if(prior?.key===key)maximumStall=Math.max(maximumStall,w.tick-prior.since);else stagnant.set(n.id,{key,since:w.tick});
    }
    assert.ok(maximumStall<144*5,'unchanged action persisted for five days');
    const compact=compactWorld(w),saved=JSON.stringify(compact);peakBytes=Math.max(peakBytes,Buffer.byteLength(saved));
    sim=Simulation.load(saved);assert.equal(sim.save(),saved);
    archived=new Set(compact.events.map(e=>e.id));
    if(day%30===0||day===100||day===365) {
      const resumed=Simulation.load(saved);sim.step(12);resumed.step(12);assert.equal(sim.save(),resumed.save());sim=Simulation.load(saved);
      const missing=db.prepare('SELECT count(*) AS n FROM refs r LEFT JOIN events e ON e.id=r.target WHERE e.id IS NULL').get() as {n:number};assert.equal(missing.n,0);
    }
    if(day===100||day===365) {
      const original=db.prepare('SELECT count(*) AS n FROM events').get() as {n:number};
      const result={seed,days:day,policy:support?'support-affordable':'observe-only',population:12,model:'off',summary:summarize(w),archivedEvents:original.n,offers,repeatedOffers:repeats,followups,deathReasons:{...deathReasons},peakRequests,peakUnmetFood,maximumStallTicks:maximumStall,peakCheckpointBytes:peakBytes,balance:balance(w),goodsBalance:urbanBalance(w),dailyRestore:true,savedContinuation:true,missingEvidence:0};
      results.push(result);console.log(JSON.stringify({seed,day,support,survivors:result.summary.population,offers,followups,deathReasons}));
      writeFileSync('reports/observation-regression.json',JSON.stringify({version:'0.13.0',completed:false,elapsedMs:Date.now()-started,results},null,2)+'\n');
    }
  }
  db.close();rmSync(dir,{recursive:true});
}
writeFileSync('reports/observation-regression.json',JSON.stringify({version:'0.13.0',completed:true,elapsedMs:Date.now()-started,results},null,2)+'\n');
