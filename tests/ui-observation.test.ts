import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { objectInspector, resourceStage } from '../src/ui/objects';
import { characterVisual } from '../src/ui/character-state';
import { appearance, portrait } from '../src/ui/characters';

test('inspection uses the selected settlement stocks and escapes names without changing the world', () => {
  const w = new Simulation(42, 100).snapshot();
  const b = w.buildings.find(b => b.kind === 'storage' && b.settlementId !== 'v0')!;
  w.civilization.settlements.find(v => v.id === b.settlementId)!.storage = { food: 12345, wood: 6789 };
  b.name = '<img src=x onerror=alert(1)>';
  const before = JSON.stringify(w), html = objectInspector(w, { kind: 'building', id: b.id });
  assert.match(html, /12345개/); assert.match(html, /6789개/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
  assert.equal(JSON.stringify(w), before);
  const r = w.resources[0]; r.amount = 0;
  assert.equal(resourceStage(r), 0); assert.match(objectInspector(w, { kind: 'resource', id: r.id }), /고갈/);
  r.amount = r.capacity; assert.equal(resourceStage(r), 2);
});

test('character appearance prioritizes health and separates sleeping or working from travelling', () => {
  const w = new Simulation(42).snapshot(), n = w.npcs[0];
  n.needs = { hunger: 0, thirst: 0, fatigue: 0, health: 100, social: 100, safety: 100 };
  w.living.people[n.id].body = { stamina: 100, cleanliness: 100, warmth: 100, pain: 0 };
  n.currentAction = { kind: 'Sleep', path: [], target: n.position, score: 1, reason: '', progress: 0, duration: 2 };
  assert.equal(characterVisual(n,w).key, 'sleeping');
  assert.match(portrait(appearance(n), characterVisual(n,w)), /잠으로 회복 중/);
  n.currentAction.path = [{x:1,y:1}]; assert.equal(characterVisual(n,w).sleeping, false); assert.equal(characterVisual(n,w).key, 'moving');
  n.currentAction.kind = 'Work'; assert.equal(characterVisual(n,w).working, false);
  n.currentAction.path = []; assert.equal(characterVisual(n,w).working, true);
  n.needs.health = 20; assert.equal(characterVisual(n,w).key, 'unwell');
  n.needs.health = 100; n.needs.fatigue = 90; assert.equal(characterVisual(n,w).key, 'tired');
  n.alive = false; assert.equal(characterVisual(n,w).key, 'departed');
});
