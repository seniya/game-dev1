import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { discover } from '../src/ui/discovery';

test('discovery is read-only, deterministic, unique and uses request evidence', () => {
  const w=new Simulation(42,12).snapshot(),before=JSON.stringify(w);
  const cards=discover(w,'all',[]);
  assert.ok(cards.length>0);assert.equal(new Set(cards.map(c=>c.npc.id)).size,cards.length);
  assert.deepEqual(discover(w,'all',[]),cards);
  const r=w.requests.items.find(r=>r.status==='open')!;
  assert.ok(r);const card=cards.find(c=>c.npc.id===r.npcId)!;
  assert.equal(card.category,'help');assert.equal(card.source,r.lastEventId);
  assert.ok(w.events.some(e=>e.id===card.source));
  assert.equal(JSON.stringify(w),before);
});
test('topic filters, empty watches, memorials and no gathering state are honest', () => {
  const w=new Simulation(42,12).snapshot();w.gatherings=undefined;
  assert.deepEqual(discover(w,'watched',[]),[]);
  assert.ok(discover(w,'help',[]).every(c=>c.category==='help'));
  assert.deepEqual(discover(w,'social',[]),[]);
  const n=w.npcs[0];n.alive=false;
  assert.ok(!discover(w,'all',[]).some(c=>c.npc.id===n.id));
  const cards=discover(w,'watched',[n.id]);assert.equal(cards.length,1);assert.equal(cards[0].label,'남겨진 삶');
});
test('social lens finds an evidenced relationship even when a request takes priority in all', () => {
  const w=new Simulation(42,12).snapshot(),r=w.requests.items[0],n=w.npcs.find(n=>n.id===r.npcId)!,other=w.npcs.find(p=>p.id!==n.id)!;
  n.relationships=[{npcId:other.id,familiarity:80,trust:30,affection:40,fear:0,resentment:0,respect:40,family:false,interpretation:'도움을 기억합니다.',evidence:[r.sourceEventId]}];
  assert.equal(discover(w,'all',[]).find(c=>c.npc.id===n.id)!.category,'help');
  const card=discover(w,'social',[]).find(c=>c.npc.id===n.id)!;
  assert.equal(card.detail,'도움을 기억합니다.');assert.equal(card.source,r.sourceEventId);
});
test('planned gatherings only recommend hosts and accepted invitees', () => {
  const w=new Simulation(42,12).snapshot(),[host,guest,declined]=w.npcs;
  w.gatherings={lastProposalDay:0,items:[{id:'g',kind:'meal',hostId:host.id,settlementId:host.settlementId,buildingId:host.homeId,createdAt:36,startsAt:72,endsAt:84,status:'planned',reason:'같이 먹어요.',sourceEventId:'source',lastEventId:'latest',evidence:[],progress:0,attendance:[],arrivals:[],invitations:[guest,declined].map((n,i)=>({npcId:n.id,deliveredAt:36,invitationEventId:'invite',responseEventId:'response',status:i?'declined':'accepted',reason:'응답'}))}]};
  const cards=discover(w,'social',[]);
  assert.deepEqual(new Set(cards.map(c=>c.npc.id)),new Set([host.id,guest.id]));
  assert.ok(cards.every(c=>c.source==='latest'&&c.detail.includes('1일 12:00')));
  w.gatherings.items[0].status='cancelled';assert.equal(discover(w,'social',[]).length,0);
});
