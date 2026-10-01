import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';
import type { Member } from './access';
import type { StoredWorld } from './world';
export interface PersonalObservation { epoch: string; watchIds: string[]; tick: number; through: number; seen: boolean }
const inputSchema = z.discriminatedUnion('type', [
  z.object({ type:z.literal('watch'), epoch:z.string(), npcId:z.string().max(100), enabled:z.boolean() }).strict(),
  z.object({ type:z.literal('seen'), epoch:z.string(), tick:z.number().int().nonnegative(), through:z.number().int().nonnegative() }).strict(),
]);
export async function personalObservation(db: D1Database, member: Member, world: StoredWorld, input?: unknown): Promise<PersonalObservation> {
  const parsed=input===undefined?undefined:inputSchema.safeParse(input);
  if(parsed && !parsed.success)throw new Error('개인 관찰 요청 형식을 확인해 주세요.');
  const change=parsed?.data;
  if (change && change.epoch !== world.epoch) throw new Error('관찰 세계가 바뀌었습니다. 다시 열어 주세요.');
  if (change?.type === 'watch' && !world.state.npcs.some(n => n.id === change.npcId)) throw new Error('관찰 주민을 찾을 수 없습니다.');
  if (change?.type === 'seen' && (change.tick > world.state.tick || change.through > world.meta.eventCount)) throw new Error('관찰 시점이 현재 세계보다 앞서 있습니다.');
  const key = [world.epoch, member.id];
  const initial = member.role === 'owner' ? world.state.observation.watchIds : [];
  const statements = [db.prepare('INSERT OR IGNORE INTO personal_observations(epoch,member,watch,tick,through,seen) SELECT ?,?,?,0,0,0 WHERE EXISTS(SELECT 1 FROM world WHERE epoch=?) AND EXISTS(SELECT 1 FROM world_members WHERE id=? AND blocked=0)').bind(...key, JSON.stringify(initial), world.epoch, member.id)];
  if (change?.type === 'watch') {
    statements.push(change.enabled
      ? db.prepare("UPDATE personal_observations SET watch=json_insert(watch,'$[#]',?) WHERE epoch=? AND member=? AND json_array_length(watch)<12 AND NOT EXISTS(SELECT 1 FROM json_each(watch) WHERE value=?)").bind(change.npcId,...key,change.npcId)
      : db.prepare("UPDATE personal_observations SET watch=(SELECT json_group_array(value) FROM json_each(watch) WHERE value<>?) WHERE epoch=? AND member=?").bind(change.npcId,...key));
  }
  if (change?.type === 'seen') statements.push(db.prepare('UPDATE personal_observations SET tick=?,through=?,seen=1 WHERE epoch=? AND member=? AND through<=? AND tick<=?').bind(change.tick,change.through,...key,change.through,change.tick));
  await db.batch(statements);
  const row = await db.prepare('SELECT watch,tick,through,seen FROM personal_observations WHERE epoch=? AND member=?').bind(...key).first<{watch:string;tick:number;through:number;seen:number}>();
  if (!row) throw new Error('관찰 세계나 참여 권한이 바뀌었습니다. 다시 연결해 주세요.');
  const watchIds = (JSON.parse(row.watch) as string[]).filter(id=>world.state.npcs.some(n=>n.id===id));
  if (change?.type === 'watch' && change.enabled && !watchIds.includes(change.npcId)) throw new Error('관심 주민은 최대 12명입니다.');
  // An uncommitted simulation tail can be lost on an engine upgrade. Never skip the restored history.
  const valid = row.tick <= world.state.tick && row.through <= world.meta.eventCount;
  return { epoch:world.epoch, watchIds, tick:valid?row.tick:0, through:valid?row.through:0, seen:!!row.seen && valid };
}
