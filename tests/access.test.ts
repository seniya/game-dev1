import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/server/worker';
import { database } from './helpers/database';
import type { Command, WorldView } from '../src/server/world';
import { defaultCharacter } from '../src/ui/characters';
import { availableHomes } from '../src/sim/characters';

function harness() {
  const DB = database(), env = { DB, SITE_OWNER_EMAIL: 'owner@example.test', ASSETS: { fetch: () => new Response('asset') } } as never;
  const call = (who: string | undefined, path: string, body?: unknown, email = `${who}@example.test`) => worker.fetch(new Request(`https://world.test/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { ...(who ? { 'oai-authenticated-user-id': who, 'oai-authenticated-user-email': email } : {}), Origin: 'https://world.test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
  const world = async (who = 'owner') => await (await call(who, 'world')).json() as WorldView;
  const command = async (who: string, action: Command['action'], id = crypto.randomUUID(), revision?: number) => call(who, 'command', { id, revision: revision ?? (await world(who)).revision, action });
  return { DB, call, world, command };
}
test('missing identity is denied and the first invited viewer cannot claim ownership', async () => {
  const h = harness(); assert.equal((await h.call(undefined, 'world')).status, 401);
  assert.equal((await (await h.call('guest', 'session')).json()).role, 'participant');
  assert.equal((await (await h.call('owner', 'session')).json()).role, 'owner');
  // Stable identity survives an email change; a different identity cannot claim the configured email afterwards.
  assert.equal((await (await h.call('owner', 'session', undefined, 'changed@example.test')).json()).role, 'owner');
  assert.equal((await (await h.call('impostor', 'session', undefined, 'owner@example.test')).json()).role, 'participant');
});
test('participants share the world but all owner-only mutations and exports are rejected server-side', async () => {
  const h = harness(); const before = await h.world();
  assert.deepEqual((await h.world('guest')).state, before.state);
  for (const action of [{ type: 'reset', seed: 7 }, { type: 'play', running: true }, { type: 'speed', speed: 20 }, { type: 'offline', enabled: true }, { type: 'ai-mode', mode: 'remote' }, { type: 'save' }, { type: 'step', ticks: 144 }, { type: 'watch', npcId: 'npc0', enabled: true }] as Command['action'][]) assert.equal((await h.command('guest', action)).status, 403, action.type);
  for (const path of ['members', 'export', 'export-stream', 'chrome/jobs/example', 'ai/jobs/example']) assert.equal((await h.call('guest', path)).status, 403, path);
  assert.equal((await h.call('guest', 'chrome/claim', {})).status, 403);
  assert.equal((await h.command('guest', { type: 'sync' })).status, 200);
  assert.equal((await h.world()).state.npcs.length, before.state.npcs.length);
});
test('creation, ownership and quota commit atomically; retries and cross-user command replay cannot duplicate NPCs', async () => {
  const h = harness(); await h.world(); let first: { id: string; revision: number; action: Command['action'] } | undefined;
  for (let j = 0; j < 3; j++) {
    const w = await h.world('guest'); const home = availableHomes(w.state).find(h => h.vacant > 0)!;
    const input = defaultCharacter(home.home.id); input.name = `참여자 주민 ${j}`;
    const command = { id: crypto.randomUUID(), revision: w.revision, action: { type: 'create-character', character: input } as Command['action'] };
    first ??= command;
    const response = await h.call('guest', 'command', command); assert.equal(response.status, 200, JSON.stringify(await response.json()));
    assert.equal((await h.call('guest', 'command', command)).status, 200);
    assert.equal((await h.call('other', 'command', command)).status, 409);
  }
  const session = await (await h.call('guest', 'session')).json(); assert.equal(session.ownNpcIds.length, 3);
  assert.equal((await (await h.call('other', 'session')).json()).ownNpcIds.length, 0);
  const w = await h.world('guest'), input = defaultCharacter(availableHomes(w.state).find(h => h.vacant > 0)!.home.id);
  assert.equal((await h.command('guest', { type: 'create-character', character: input })).status, 403);
  assert.equal((await h.world()).state.npcs.length, 15);
  assert.equal((await h.call('guest', 'command', first)).status, 200);
});
test('concurrent visitors cannot overwrite creations and revoked visitors cannot read or write', async () => {
  const h = harness(); const w = await h.world();
  const input = defaultCharacter('b4');
  const replies = await Promise.all(['a','b'].map(who => h.command(who, { type: 'create-character', character: input }, crypto.randomUUID(), w.revision)));
  assert.deepEqual(replies.map(r => r.status).sort(), [200,409]);
  assert.equal((await h.world()).state.npcs.length, 13);
  assert.equal((await h.call('owner', 'members', { id: 'a', blocked: true })).status, 200);
  assert.equal((await h.call('a', 'world')).status, 403); assert.equal((await h.call('a', 'session')).status, 403);
  assert.equal((await h.call('b', 'members', { id: 'owner', blocked: true })).status, 403);
  assert.equal((await h.call('owner', 'members', { id: 'owner', blocked: true })).status, 400);
  assert.equal((await h.call('owner', 'members', { id: 'a', blocked: false })).status, 200);
  assert.equal((await h.call('a', 'world')).status, 200);
});

test('the original owner retains legacy NPCs once without claiming new visitors or imported residents', async () => {
  const { WorldStore } = await import('../src/server/store');
  const { applyCommand } = await import('../src/server/world');
  const h = harness(), store = new WorldStore(h.DB); await store.init(0);
  const initial = await store.read();
  const old = await applyCommand(initial, {id:crypto.randomUUID(),revision:initial.revision,action:{type:'create-character',character:defaultCharacter('b4')}}, 0);
  await store.commit(old.world, old.events, 'old-owner-create', crypto.randomUUID());
  const guestInput = defaultCharacter('b5');
  assert.equal((await h.command('guest',{type:'create-character',character:guestInput})).status, 200);
  const guest = await (await h.call('guest','session')).json();
  const owner = await (await h.call('owner','session')).json();
  assert.deepEqual(owner.ownNpcIds,[old.world.meta.createdCharacter!.npcId]); assert.equal(guest.ownNpcIds.length,1);
  assert.equal((await h.command('owner',{type:'import',save:JSON.stringify(old.world.state)})).status,200);
  assert.deepEqual((await (await h.call('owner','session')).json()).ownNpcIds,[]);
});

test('personal observation is per account, survives reconnects, merges concurrent stars and never changes world history', async()=>{
  const h=harness(), before=await h.world();
  const prefs=async(who:string)=>await(await h.call(who,'personal-observation')).json();
  await Promise.all(['guest','other'].map(prefs));
  await Promise.all(['npc0','npc1'].map(npcId=>h.call('guest','personal-observation',{type:'watch',epoch:before.epoch,npcId,enabled:true})));
  assert.deepEqual((await prefs('guest')).watchIds.sort(),['npc0','npc1']);
  assert.deepEqual((await prefs('other')).watchIds,[]);
  assert.deepEqual((await prefs('owner')).watchIds,[]);
  assert.equal((await h.call('guest','personal-observation',{type:'watch',epoch:before.epoch,npcId:'missing',enabled:true})).status,400);
  assert.equal((await h.call('guest','personal-observation',{type:'watch',epoch:before.epoch,npcId:'npc0',enabled:true,member:'owner'})).status,400);
  await h.command('owner',{type:'step',ticks:12}); const progressed=await h.world();
  const seen={type:'seen',epoch:before.epoch,tick:progressed.state.tick,through:progressed.meta.eventCount};
  assert.equal((await h.call('guest','personal-observation',seen)).status,200);
  await h.call('guest','personal-observation',{...seen,tick:0,through:0});
  assert.equal((await prefs('guest')).through,seen.through); assert.equal((await prefs('other')).seen,false);
  assert.equal((await h.call('guest','personal-observation',{...seen,tick:seen.tick+1})).status,400);
  assert.deepEqual(await h.world(),progressed);
  await h.call('owner','members',{id:'guest',blocked:true}); assert.equal((await h.call('guest','personal-observation')).status,403);
  await h.call('owner','members',{id:'guest',blocked:false}); assert.deepEqual((await prefs('guest')).watchIds.sort(),['npc0','npc1']);
  await h.command('owner',{type:'reset',seed:42,population:12});
  assert.deepEqual((await prefs('guest')).watchIds,[]); assert.equal((await prefs('guest')).seen,false);
  assert.equal((await h.call('guest','personal-observation',seen)).status,400);
});

test('personal stars enforce twelve residents and remain independent of NPC creation quota', async()=>{
  const h=harness(), w=await h.world();
  for(const n of w.state.npcs) assert.equal((await h.call('guest','personal-observation',{type:'watch',epoch:w.epoch,npcId:n.id,enabled:true})).status,200);
  await h.command('guest',{type:'create-character',character:defaultCharacter('b4')});
  const session=await(await h.call('guest','session')).json();
  const add={type:'watch',epoch:w.epoch,npcId:session.ownNpcIds[0],enabled:true};
  assert.equal((await h.call('guest','personal-observation',add)).status,400);
  await h.call('guest','personal-observation',{...add,npcId:'npc0',enabled:false});
  assert.equal((await h.call('guest','personal-observation',add)).status,200);
  assert.equal((await(await h.call('guest','personal-observation')).json()).watchIds.length,12);
});
