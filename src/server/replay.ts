import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { applyCommand, compactWorld, type Command, type StoredWorld } from './world';
import { DecisionCoordinator } from '../llm/coordinator';
import { MockLLMProvider } from '../llm/provider';
import { restoreChange, stateChange, type StateChange } from './journal';
import { Simulation } from '../sim/engine';
declare const __SIMULATION_BUILD__: string;
const build = typeof __SIMULATION_BUILD__ === 'string' ? __SIMULATION_BUILD__ : 'test';
const LIMIT = 16_000_000,
  MAX_FRAMES = 500;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const object = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(object)
      .filter((k) => object[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stable(object[k]))
      .join(',') +
    '}'
  );
}
export async function replayHash(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
const clean = (w: StoredWorld) => ({ epoch: w.epoch, revision: w.revision, meta: w.meta, state: w.state });
function parts(db: D1Database, frame: number, body: string) {
  const result: D1PreparedStatement[] = [];
  for (let i = 0, p = 0; i < body.length; p++) {
    let end = Math.min(i + 24_000, body.length);
    if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
    result.push(db.prepare('INSERT INTO replay_parts VALUES(?,?,?)').bind(frame, p, body.slice(i, end)));
    i = end;
  }
  return result;
}
interface Session {
  epoch: string;
  revision: number;
  head: number;
  bytes: number;
  status: string;
  created: number;
  build: string;
  hash: string;
}
export interface ReplayFrame {
  sequence: number;
  before: string;
  after: string;
  hash: string;
  accepted: unknown;
  change: StateChange;
}
export interface ReplayBundle {
  version: 1;
  build: string;
  created: number;
  status: string;
  anchor: StoredWorld;
  frames: ReplayFrame[];
  headHash: string;
  revision: number;
}
export async function startReplay(db: D1Database, w: StoredWorld, now: number) {
  const body = JSON.stringify(clean(w)),
    bytes = new TextEncoder().encode(body).length;
  if (bytes > LIMIT / 2) throw new Error('저장 검증 기록을 시작하기에는 세계 상태가 너무 큽니다.');
  await db.batch([
    db
      .prepare('INSERT INTO commit_guard SELECT EXISTS(SELECT 1 FROM world WHERE revision=? AND epoch=?)')
      .bind(w.revision, w.epoch),
    db.prepare('DELETE FROM commit_guard'),
    db.prepare('DELETE FROM replay_parts'),
    db.prepare('DELETE FROM replay_session'),
    db
      .prepare("INSERT INTO replay_session VALUES(1,?,?,0,?,'recording',?,?,?)")
      .bind(w.epoch, w.revision, bytes, now, build, await replayHash(clean(w))),
    ...parts(db, 0, body),
  ]);
  return {
    message:
      '지금 확정된 상태부터 기록합니다. 이전 검증 기록은 교체했습니다. 최대 500회·16MB·30일이며 일반 동기화의 추가 저장은 없습니다.',
  };
}
export async function replayStatements(
  db: D1Database,
  before: StoredWorld,
  after: StoredWorld,
  accepted: unknown,
  now: number,
): Promise<D1PreparedStatement[]> {
  const s = await db.prepare('SELECT * FROM replay_session WHERE id=1').first<Session>();
  if (!s || s.status !== 'recording') return [];
  if (
    s.build !== build ||
    s.revision !== before.revision ||
    s.epoch !== before.epoch ||
    now - s.created > 30 * 86_400_000
  )
    return [db.prepare("UPDATE replay_session SET status='boundary' WHERE id=1")];
  const previous = await replayHash(clean(before));
  if (previous !== s.hash) return [db.prepare("UPDATE replay_session SET status='mismatch' WHERE id=1")];
  const frame: ReplayFrame = {
    sequence: s.head + 1,
    before: previous,
    after: await replayHash(clean(after)),
    hash: '',
    accepted,
    change: stateChange(clean(before), clean(after)),
  };
  frame.hash = await replayHash({ ...frame, hash: undefined });
  const body = JSON.stringify(frame),
    bytes = new TextEncoder().encode(body).length;
  if (s.head >= MAX_FRAMES || s.bytes + bytes > LIMIT)
    return [db.prepare("UPDATE replay_session SET status='full' WHERE id=1")];
  return [
    db
      .prepare(
        "UPDATE replay_session SET epoch=?,revision=?,head=head+1,bytes=bytes+?,hash=? WHERE id=1 AND head=? AND hash=? AND status='recording'",
      )
      .bind(after.epoch, after.revision, bytes, frame.after, s.head, previous),
    db.prepare('INSERT INTO commit_guard VALUES(changes())'),
    db.prepare('DELETE FROM commit_guard'),
    ...parts(db, frame.sequence, body),
  ];
}
export async function exportReplay(db: D1Database): Promise<ReplayBundle> {
  const rows = await db.batch([
    db.prepare('SELECT * FROM replay_session WHERE id=1'),
    db.prepare('SELECT frame,part,body FROM replay_parts ORDER BY frame,part'),
  ]);
  const s = rows[0].results[0] as unknown as Session | undefined;
  if (!s) throw new Error('저장 검증 기록을 먼저 시작해 주세요.');
  const data: string[] = [];
  let current = -1,
    part = 0;
  for (const r of rows[1].results as unknown as { frame: number; part: number; body: string }[]) {
    if (r.frame !== current) {
      if (r.frame !== current + 1) throw new Error('저장 재생 순서가 누락되었습니다.');
      current = r.frame;
      part = 0;
      data[current] = '';
    }
    if (r.part !== part++) throw new Error('저장 재생 조각이 누락되었습니다.');
    data[current] += r.body;
  }
  if (data.length !== s.head + 1) throw new Error('저장 재생 기록이 누락되었습니다.');
  return {
    version: 1,
    build: s.build,
    created: s.created,
    status: s.status,
    anchor: JSON.parse(data[0]),
    frames: data.slice(1).map((x) => JSON.parse(x)),
    headHash: s.hash,
    revision: s.revision,
  };
}
export async function verifyReplay(bundle: ReplayBundle, replayEngine = false) {
  let engineChecks = 0;
  if (replayEngine && bundle.build !== build)
    throw new Error('저장 재생의 엔진 소스 지문이 다릅니다. 상태 기록만 검증하거나 원래 소스에서 재실행하세요.');
  if (bundle.version !== 1 || bundle.frames.length > MAX_FRAMES) throw new Error('저장 재생 형식을 확인해 주세요.');
  let world = structuredClone(bundle.anchor),
    hash = await replayHash(clean(world));
  for (let i = 0; i < bundle.frames.length; i++) {
    const frame = bundle.frames[i];
    if (
      frame.sequence !== i + 1 ||
      frame.before !== hash ||
      frame.hash !== (await replayHash({ ...frame, hash: undefined }))
    )
      throw new Error(`저장 재생 ${i + 1}번째 명령·결과 기록이 손상되었습니다.`);
    const before = structuredClone(world);
    world = restoreChange(world, structuredClone(frame.change));
    const accepted = frame.accepted as {
      at: number;
      replay?: { ticks: number; meta: StoredWorld['meta']; command?: Command };
    };
    const input = accepted.replay;
    if (
      replayEngine &&
      input?.command &&
      !['import', 'import-upload', 'restore-backup'].includes(input.command.action.type)
    ) {
      const sim = Simulation.load(JSON.stringify(before.state)),
        coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
      for (let tick = 0; tick < input.ticks; tick++) {
        sim.step();
        if (before.meta.aiMode !== 'remote' && before.meta.aiMode !== 'chrome' && sim.pending)
          await coordinator.drain();
      }
      const current = { ...before, meta: input.meta, state: compactWorld(sim.snapshot()) };
      const replayed = await applyCommand(current, input.command, accepted.at);
      if ((await replayHash(replayed.world.state)) !== (await replayHash(world.state)))
        throw new Error(`저장 재생 ${i + 1}번째 엔진 결과가 일치하지 않습니다.`);
      engineChecks++;
    }
    hash = await replayHash(clean(world));
    if (hash !== frame.after) throw new Error(`저장 재생 ${i + 1}번째 결과가 일치하지 않습니다.`);
  }
  if (hash !== bundle.headHash || world.revision !== bundle.revision)
    throw new Error('저장 재생의 최종 상태가 일치하지 않습니다.');
  Simulation.load(JSON.stringify(world.state));
  return {
    message: `확정 기록 ${bundle.frames.length}회를 재생하여 최종 상태·근거가 일치함을 확인했습니다.`,
    frames: bundle.frames.length,
    engineChecks,
    revision: world.revision,
    tick: world.state.tick,
    hash,
    world,
  };
}
