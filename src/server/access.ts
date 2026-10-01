import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Command, StoredWorld } from './world';
declare const __LOCAL_AUTH__: boolean;
export interface AccessEnv { SITE_OWNER_EMAIL?: string; TEST_AUTH?: string }
export interface Member { id: string; email: string; name: string; role: 'owner' | 'participant'; blocked: number }
export interface SessionView { name: string; role: Member['role']; ownNpcIds: string[]; npcLimit: number | null; local: boolean }
export class AccessError extends Error { constructor(message: string, readonly status = 403) { super(message); } }
export function identity(request: Request, env: AccessEnv) {
  const host = new URL(request.url).hostname;
  const local = (typeof __LOCAL_AUTH__ === 'undefined' ? env.TEST_AUTH === '1' : __LOCAL_AUTH__) && ['localhost', '127.0.0.1', 'world.test'].includes(host);
  const id = request.headers.get('oai-authenticated-user-id') ?? (local ? 'local-owner' : '');
  const email = request.headers.get('oai-authenticated-user-email') ?? (local ? 'owner@local.test' : '');
  if (!id || !email || id.length > 300 || email.length > 320) throw new AccessError('초대받은 계정으로 로그인해 주세요.', 401);
  let name = email;
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(request.headers.get('oai-authenticated-user-full-name') ?? '') || email; } catch {}
  }
  return { id, email, name: name.slice(0, 100), local, ownerEmail: local ? 'owner@local.test' : env.SITE_OWNER_EMAIL };
}
export async function memberFor(db: D1Database, principal: ReturnType<typeof identity>): Promise<Member> {
  const owner = await db.prepare("SELECT id FROM world_members WHERE role='owner'").first<{ id: string }>();
  // Bootstrap only the configured, dispatch-authenticated owner. Subsequent authorization uses the stable Site identity.
  const role = owner?.id === principal.id || !owner && principal.ownerEmail && principal.email.toLowerCase() === principal.ownerEmail.toLowerCase() ? 'owner' : 'participant';
  let member = await db.prepare('SELECT * FROM world_members WHERE id=?').bind(principal.id).first<Member>();
  if (!member) {
    await db.batch([db.prepare('INSERT OR IGNORE INTO world_members(id,email,name,role,blocked) VALUES(?,?,?,?,0)').bind(principal.id, principal.email, principal.name, role)]);
    member = (await db.prepare('SELECT * FROM world_members WHERE id=?').bind(principal.id).first<Member>())!;
  }
  if (member.blocked) throw new AccessError('이 세계의 참여 권한이 해제되었습니다. 소유자에게 문의해 주세요.');
  return member;
}
export function requireOwner(member: Member) { if (member.role !== 'owner') throw new AccessError('세계 설정과 개입은 소유자만 변경할 수 있습니다.'); }
export function authorizeCommand(member: Member, command: Command) {
  if (member.role !== 'owner' && !['sync', 'create-character'].includes(command.action.type)) requireOwner(member);
}
export async function sessionView(db: D1Database, member: Member, world: StoredWorld, local: boolean): Promise<SessionView> {
  const rows = await db.prepare('SELECT npc FROM npc_creators WHERE epoch=? AND member=?').bind(world.epoch, member.id).all<{ npc: string }>();
  const own = rows.results.map(r => r.npc);
  return { name: member.name, role: member.role, ownNpcIds: own, npcLimit: member.role === 'owner' ? null : 3, local };
}
export async function checkCreation(db: D1Database, member: Member, world: StoredWorld) {
  if (member.role === 'owner') return;
  const count = await db.prepare('SELECT count(*) AS n FROM npc_creators WHERE epoch=? AND member=?').bind(world.epoch, member.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 3) throw new AccessError('한 세계에서 참여자 한 명은 NPC를 최대 3명 만들 수 있습니다.');
}
export function creationStatements(db: D1Database, member: Member, world: StoredWorld, command: Command): D1PreparedStatement[] {
  if (command.action.type !== 'create-character') return [];
  return [
    db.prepare('INSERT INTO commit_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM world_members WHERE id=? AND blocked=0) THEN 1 ELSE 0 END').bind(member.id),
    ...(member.role === 'owner' ? [] : [db.prepare('INSERT INTO commit_guard(ok) SELECT CASE WHEN count(*)<3 THEN 1 ELSE 0 END FROM npc_creators WHERE epoch=? AND member=?').bind(world.epoch, member.id)]),
    db.prepare('INSERT INTO npc_creators(epoch,npc,member,command) VALUES(?,?,?,?)').bind(world.epoch, world.meta.createdCharacter!.npcId, member.id, command.id),
  ];
}

/** Run once for the original owner when upgrading the formerly single-owner world. */
export async function claimLegacyResidents(db: D1Database, member: Member, read: () => Promise<StoredWorld>) {
  if (member.role !== 'owner' || await db.prepare("SELECT id FROM access_migrations WHERE id='legacy-v17'").first()) return;
  const world = await read();
  const legacy = world.state.npcs.filter(n => n.profile).map(n => ({ npc: n.id, command: `legacy:${world.epoch}:${n.id}` }));
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO npc_creators(epoch,npc,member,command) SELECT ?,json_extract(value,'$.npc'),?,json_extract(value,'$.command') FROM json_each(?)").bind(world.epoch, member.id, JSON.stringify(legacy)),
    db.prepare("INSERT OR IGNORE INTO access_migrations VALUES('legacy-v17')"),
  ]);
}
