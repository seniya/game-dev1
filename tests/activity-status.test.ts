import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { createCharacter } from '../src/sim/characters';
import { defaultCharacter } from '../src/ui/characters';
import { activityStatus } from '../src/sim/activity-status';
import { activity, activityView } from '../src/ui/activity';
import { characterVisual } from '../src/ui/character-state';
import { neighborPeople } from '../src/sim/neighbors';
import { focusView } from '../src/ui/scenes';
import { lifeDay } from '../src/sim/life';
import { YEAR_TICKS } from '../src/sim/types';
import { startMigration, stocks } from '../src/sim/civilization';

test('sixteen-year-old keeps eating while observation describes care, then changes at adulthood', () => {
  const sim = new Simulation(42,12); sim.setLLM(false);
  const id = sim.createCharacter({...defaultCharacter('b4'), name:'돌봄 재현', age:16, occupation:'carpenter'});
  sim.step(144);
  const w = sim.snapshot(), n = w.npcs.find(n => n.id === id)!;
  assert.ok(n.alive && n.needs.health > 95);
  assert.equal(n.currentAction, undefined);
  assert.ok(w.events.some(e => e.actorId === id && e.kind === 'consumption'));
  const before = JSON.stringify(w);
  assert.equal(activity(w,n).label, '집에서 돌봄을 받는 중');
  assert.match(activityView(w,n), /16세 · 18세 전에는/);
  assert.doesNotMatch(activityView(w,n), /<progress|다음 행동을 생각/);
  assert.match(focusView(w,n), /돌봄을 받으며 자랍니다/);
  assert.equal(characterVisual(n,w).key, 'care');
  assert.equal(neighborPeople(w,new Set([id]))[0].action, activity(w,n).label);
  assert.equal(JSON.stringify(w),before, 'observation must not change world or age');
  n.life.bornTick = w.tick - 18 * YEAR_TICKS; lifeDay(w);
  assert.equal(n.identity.age,18);
  assert.equal(activityStatus(w,n).label,'다음 생활 행동 준비 중');
});

test('child return path, missing guardian and actual food shortage are distinct', () => {
  const w = new Simulation().snapshot(), n = createCharacter(w,{...defaultCharacter('b4'), age:16});
  n.position = {...w.npcs[0].position};
  if(n.position.x === w.buildings.find(b=>b.id===n.homeId)!.position.x) n.position = {...w.buildings.find(b=>b.kind==='well')!.position};
  assert.equal(activityStatus(w,n).moving,true);
  assert.equal(characterVisual(n,w).moving,true);
  const home = w.buildings.find(b=>b.id===n.homeId)!;
  const tile = home.position.y*w.width+home.position.x, terrain=w.tiles[tile];
  w.tiles[tile]='water'; assert.equal(activityStatus(w,n).label,'집으로 돌아갈 길이 막힘');
  w.tiles[tile]=terrain; n.position={...home.position};
  for(const p of w.npcs) if(p.id!==n.id && p.homeId===n.homeId) p.alive=false;
  assert.equal(activityStatus(w,n).label,'보호자의 돌봄 필요');
  const adult=w.npcs.find(p=>p.id!==n.id && p.homeId===n.homeId)!; adult.alive=true;
  adult.inventory.food=1; n.inventory.food=0; stocks(w,n.settlementId).food=0; n.needs.hunger=80;
  assert.equal(activityStatus(w,n).label,'돌봄 식량 필요');
  n.alive=false; assert.equal(activityStatus(w,n).label,'세상을 떠남');
});

test('migration without currentAction shows real journey instead of idle or thinking', () => {
  const w=new Simulation(42,40).snapshot(), n=w.npcs[0];
  assert.equal(startMigration(w,n,w.civilization.settlements[1]),true);
  assert.equal(n.currentAction,undefined);
  assert.equal(activity(w,n).label,'새 마을로 이주 중');
  assert.equal(characterVisual(n,w).moving,true);
  assert.match(focusView(w,n),/남은 길/);
  assert.equal(neighborPeople(w,new Set([n.id]))[0].action,'새 마을로 이주 중');
});
