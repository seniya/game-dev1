import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';
import { Simulation } from '../sim/engine';
import { compactWorld, type StoredWorld } from './world';
import { Conflict, WorldStore } from './store';
export const UPLOAD_LIMIT = 24_000_000,
  UPLOAD_CHARS = 24_000;
const DAY = 86_400_000;

interface Upload {
  id: string;
  member: string;
  epoch: string;
  hash: string;
  bytes: number;
  received: number;
  next: number;
  status: string;
  expires: number;
  summary: string | null;
  validation_until: number;
}
export async function cleanupUploads(db: D1Database, now: number) {
  await db.batch(
    ['upload_parts', 'upload_states', 'upload_events']
      .map((t) => db.prepare(`DELETE FROM ${t} WHERE upload IN (SELECT id FROM uploads WHERE expires<?)`).bind(now))
      .concat(db.prepare('DELETE FROM archive_imports WHERE id IN (SELECT id FROM uploads WHERE expires<?)').bind(now),db.prepare('DELETE FROM uploads WHERE expires<?').bind(now)),
  );
}
export const hashText = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
export function splitText(text: string) {
  const parts: string[] = [];
  for (let i = 0; i < text.length; ) {
    let end = Math.min(i + UPLOAD_CHARS, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    parts.push(text.slice(i, end));
    i = end;
  }
  return parts;
}
async function getUpload(db: D1Database, member: string, id: string, now: number) {
  const row = await db
    .prepare('SELECT * FROM uploads WHERE id=? AND member=? AND expires>?')
    .bind(id, member, now)
    .first<Upload>();
  if (!row) throw new Error('저장 업로드가 없거나 만료되었습니다. 파일을 다시 선택해 주세요.');
  return row;
}
const inputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('start'),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      bytes: z.number().int().min(1).max(UPLOAD_LIMIT),
    })
    .strict(),
  z
    .object({
      type: z.literal('part'),
      id: z.string().uuid(),
      part: z.number().int().min(0).max(3000),
      text: z.string().min(1).max(UPLOAD_CHARS),
    })
    .strict(),
  z.object({ type: z.literal('validate'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('cancel'), id: z.string().uuid() }).strict(),
]);
export async function uploadRequest(store: WorldStore, member: string, raw: unknown, now = Date.now()) {
  const checked = inputSchema.safeParse(raw);
  if (!checked.success) throw new Error('저장 업로드 요청을 확인해 주세요. 최대 24MB입니다.');
  const input = checked.data,
    db = store.db;
  if (input.type === 'start') {
    await cleanupUploads(db, now);
    await db.batch([
      db
        .prepare("UPDATE uploads SET status='open' WHERE member=? AND status='validating' AND validation_until<=?")
        .bind(member, now),
    ]);
    const world = await store.read();
    const existing = await db
      .prepare(
        "SELECT * FROM uploads WHERE member=? AND epoch=? AND hash=? AND bytes=? AND status IN ('open','ready','validating') AND expires>? ORDER BY expires DESC LIMIT 1",
      )
      .bind(member, world.epoch, input.hash, input.bytes, now)
      .first<Upload>();
    if (existing) return { id: existing.id, next: existing.next, status: existing.status };
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO uploads(id,member,epoch,hash,bytes,status,expires) SELECT ?,?,?,?,?,'open',? WHERE (SELECT count(*) FROM uploads WHERE member=? AND status<>'applied' AND expires>?)<2",
        )
        .bind(id, member, world.epoch, input.hash, input.bytes, now + DAY, member, now),
      db.prepare('INSERT INTO commit_guard VALUES(changes())'),
      db.prepare('DELETE FROM commit_guard'),
    ]);
    return { id, next: 0, status: 'open' };
  }
  const u = await getUpload(db, member, input.id, now);
  if (input.type === 'cancel') {
    await db.batch([db.prepare('UPDATE uploads SET expires=0 WHERE id=?').bind(u.id)]);
    await cleanupUploads(db, now);
    return { cancelled: true };
  }
  if (input.type === 'part') {
    const bytes = new TextEncoder().encode(input.text).length;
    if (input.part < u.next) {
      const prior = await db
        .prepare('SELECT body FROM upload_parts WHERE upload=? AND part=?')
        .bind(u.id, input.part)
        .first<{ body: string }>();
      if (prior?.body !== input.text) throw new Error('저장 업로드 조각이 기존 내용과 다릅니다.');
      return { next: u.next };
    }
    if (u.status !== 'open' || u.next !== input.part || u.received + bytes > u.bytes)
      throw new Error('저장 업로드 순서 또는 크기가 올바르지 않습니다.');
    await db.batch([
      db
        .prepare(
          "UPDATE uploads SET received=received+?,next=next+1 WHERE id=? AND next=? AND status='open' AND expires>?",
        )
        .bind(bytes, u.id, input.part, now),
      db.prepare('INSERT INTO commit_guard VALUES(changes())'),
      db.prepare('DELETE FROM commit_guard'),
      db.prepare('INSERT INTO upload_parts VALUES(?,?,?)').bind(u.id, input.part, input.text),
    ]);
    return { next: u.next + 1 };
  }
  const current = await store.read();
  if (current.epoch !== u.epoch) throw new Conflict('세계가 교체되어 저장 업로드를 적용할 수 없습니다.');
  if (u.status === 'ready')
    return { id: u.id, summary: JSON.parse(u.summary!), epoch: current.epoch, revision: current.revision };
  if (u.status === 'validating') throw new Error('저장 파일을 검증 중입니다. 2분 후 같은 파일을 다시 선택해 주세요.');
  if (u.received !== u.bytes || u.status !== 'open') throw new Error('저장 업로드가 아직 완료되지 않았습니다.');
  const rows = await db
    .prepare('SELECT part,body FROM upload_parts WHERE upload=? ORDER BY part')
    .bind(u.id)
    .all<{ part: number; body: string }>();
  if (rows.results.some((p, i) => p.part !== i) || rows.results.length !== u.next)
    throw new Error('저장 업로드 조각이 누락되었습니다.');
  const text = rows.results.map((r) => r.body).join('');
  if ((await hashText(text)) !== u.hash) throw new Error('저장 파일 해시가 일치하지 않습니다.');
  const state = Simulation.load(text).snapshot();
  const living = state.npcs.filter((n) => n.alive).length;
  if (living > 3000) throw new Error('주민은 최대 3000명까지 지원합니다.');
  const summary = {
    bytes: u.bytes,
    seed: state.seed,
    tick: state.tick,
    living,
    people: state.npcs.length,
    events: state.events.length,
    version: state.version,
  };
  // Claim staging; abandoned validation can be restarted by reselecting after lease expiry.
  const validationUntil = now + 120_000;
  const stageGuard = () => [
    db
      .prepare(
        "INSERT INTO commit_guard SELECT EXISTS(SELECT 1 FROM uploads WHERE id=? AND status='validating' AND validation_until=?)",
      )
      .bind(u.id, validationUntil),
    db.prepare('DELETE FROM commit_guard'),
  ];
  await db.batch([
    db
      .prepare("UPDATE uploads SET status='validating',validation_until=? WHERE id=? AND status='open'")
      .bind(validationUntil, u.id),
    db.prepare('INSERT INTO commit_guard VALUES(changes())'),
    db.prepare('DELETE FROM commit_guard'),
  ]);
  try {
    await db.batch([
      ...stageGuard(),
      db.prepare('DELETE FROM upload_states WHERE upload=?').bind(u.id),
      db.prepare('DELETE FROM upload_events WHERE upload=?').bind(u.id),
    ]);
    const chunks = splitText(JSON.stringify(compactWorld(state)));
    for (let i = 0; i < chunks.length; i += 20)
      await db.batch([
        ...stageGuard(),
        ...chunks
          .slice(i, i + 20)
          .map((body, j) => db.prepare('INSERT INTO upload_states VALUES(?,?,?)').bind(u.id, i + j, body)),
      ]);
    for (let i = 0; i < state.events.length; i += 30)
      await db.batch([
        ...stageGuard(),
        ...state.events
          .slice(i, i + 30)
          .map((e, j) =>
            db.prepare('INSERT INTO upload_events VALUES(?,?,?)').bind(u.id, i + j + 1, JSON.stringify(e)),
          ),
      ]);
    await db.batch([
      ...stageGuard(),
      db
        .prepare("UPDATE uploads SET status='ready',summary=? WHERE id=? AND status='validating'")
        .bind(JSON.stringify(summary), u.id),
    ]);
  } catch (e) {
    await db.batch([
      db
        .prepare("UPDATE uploads SET status='open' WHERE id=? AND status='validating' AND validation_until=?")
        .bind(u.id, validationUntil),
    ]);
    throw e;
  }
  return { id: u.id, summary, epoch: current.epoch, revision: current.revision };
}
export async function prepareUpload(
  store: WorldStore,
  current: StoredWorld,
  member: string,
  id: string,
  commandId: string,
  now: number,
) {
  const db = store.db,
    u = await getUpload(db, member, id, now);
  if (u.status !== 'ready' || u.epoch !== current.epoch) throw new Error('저장 업로드를 다시 확인해 주세요.');
  const rows = await db
    .prepare('SELECT body FROM upload_states WHERE upload=? ORDER BY part')
    .bind(id)
    .all<{ body: string }>();
  const state = Simulation.load(rows.results.map((r) => r.body).join('')).snapshot();
  const stats = await db
    .prepare(
      "SELECT count(*) AS n,sum(CASE WHEN json_extract(body,'$.kind') IN ('gathering','share','talk','witness','rumor') THEN 1 ELSE 0 END) AS social FROM upload_events WHERE upload=?",
    )
    .bind(id)
    .first<{ n: number; social: number }>();
  if (!stats || stats.n !== JSON.parse(u.summary!).events) throw new Error('저장 업로드 사건이 누락되었습니다.');
  const world: StoredWorld = {
    epoch: id,
    revision: current.revision + 1,
    state,
    meta: {
      running: false,
      speed: current.meta.speed,
      offline: current.meta.offline,
      clock: now,
      lastSeen: now,
      eventCount: stats.n,
      socialCount: stats.social ?? 0,
      catchupTicks: 0,
      skippedTicks: 0,
      backupEpoch: current.epoch,
      aiMode: state.llm.enabled ? 'mock' : 'off',
      aiGeneration: commandId,
    },
  };
  const extra = [
    db.prepare("UPDATE uploads SET status='applied' WHERE id=? AND status='ready' AND expires>?").bind(id, now),
    db.prepare('INSERT INTO commit_guard VALUES(changes())'),
    db.prepare('DELETE FROM commit_guard'),
    db
      .prepare(
        "INSERT INTO events SELECT ?,json_extract(body,'$.id'),seq,json_extract(body,'$.tick'),json_extract(body,'$.kind'),json_extract(body,'$.causeId'),body FROM upload_events WHERE upload=?",
      )
      .bind(id, id),
    db
      .prepare(
        "INSERT OR IGNORE INTO participants SELECT ?,p.value,json_extract(e.body,'$.id'),e.seq FROM upload_events e,json_each(json_extract(e.body,'$.participants')) p WHERE upload=? UNION SELECT ?,json_extract(body,'$.actorId'),json_extract(body,'$.id'),seq FROM upload_events WHERE upload=? AND json_extract(body,'$.actorId') IS NOT NULL UNION SELECT ?,json_extract(body,'$.targetId'),json_extract(body,'$.id'),seq FROM upload_events WHERE upload=? AND json_extract(body,'$.targetId') IS NOT NULL",
      )
      .bind(id, id, id, id, id, id),
    db
      .prepare(
        "INSERT OR IGNORE INTO event_refs SELECT ?,p.value,json_extract(e.body,'$.id') FROM upload_events e,json_each(json_extract(e.body,'$.data.evidence')) p WHERE upload=?",
      )
      .bind(id, id),
    ...['upload_parts', 'upload_states', 'upload_events'].map((t) =>
      db.prepare(`DELETE FROM ${t} WHERE upload=?`).bind(id),
    ),
  ];
  return { world, events: [], motion: undefined, extra };
}
