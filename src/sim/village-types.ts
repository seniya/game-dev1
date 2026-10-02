import { z } from 'zod';
const id = z.string().min(1).max(100), nat = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const pos = z.object({ x: nat.max(191), y: nat.max(127) }).strict();
export const activitySchema = z.object({
  id, kind: z.enum(['play', 'escort', 'supervise', 'return', 'care', 'recover', 'learn', 'domestic']),
  source: id, since: nat, until: nat, target: pos, path: z.array(pos).max(16384),
  water: z.boolean().optional(), partner: id.optional(), guardian: id.optional(), progress: nat, reason: z.string().max(2000),
}).strict();
export const injurySchema = z.object({ id, npc: id, source: id, latest: id, since: nat, remaining: z.number().finite().min(0).max(100), severity: z.enum(['minor', 'moderate']), treatedAt: nat.optional(), caregiver: id.optional(), cause: z.enum(['play', 'work', 'conflict', 'existing']) }).strict();
export const conflictSchema = z.object({ id, source: id, latest: id, a: id, b: id, since: nat, next: nat, phase: z.enum(['complaint', 'argument', 'aftermath']), injured: z.boolean() }).strict();
export const developmentSchema = z.object({ stage: nat.max(4), streak: nat, proposed: nat.max(4), unlocked: z.array(id).max(40), demand: z.record(z.number().finite().nonnegative()), previousDemand: z.record(z.number().finite().nonnegative()), reason: z.string().max(2000), lastDay: nat, lastAssigned: nat, production: nat, consumption: nat, previousProduction: nat, previousConsumption: nat, todayProduced: nat, todayConsumed: nat }).strict();
export const villageLifeSchema = z.object({
  revision: z.literal(1), since: nat, settlements: z.record(developmentSchema),
  activities: z.record(activitySchema), injuries: z.array(injurySchema).max(3000), conflicts: z.array(conflictSchema).max(1500),
  people: z.record(z.object({ nextPlay: nat, firstOuting: id.optional(), lastPlay: id.optional(), careerTick: nat, helpSource: id.optional() }).strict()),
  cooldowns: z.record(nat), usedCauses: z.record(nat),
  stats: z.object({ contacts: nat, plays: nat, arguments: nat, collisions: nat, injuries: nat, treatments: nat, recoveries: nat, careTicks: nat, outings: nat, returns: nat, careerChanges: nat }).strict(),
}).strict();
export type VillageLife = z.infer<typeof villageLifeSchema>;
export type VillageActivity = z.infer<typeof activitySchema>;
export type Injury = z.infer<typeof injurySchema>;
export const VILLAGE_ACTIVITY_LABELS: Record<VillageActivity['kind'], string> = { play: '밖에서 놀기', escort: '아이와 함께 외출', supervise: '아이들 지켜보기', return: '안전하게 귀가', care: '이웃 돌보기', recover: '도움을 기다리며 회복', learn: '함께 배우기', domestic: '집살림 돕기' };
