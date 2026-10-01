import { z } from 'zod';
const id = z.string().min(1).max(100), tick = z.number().int().nonnegative();
export const REQUEST_KINDS = ['food', 'clothing', 'housing'] as const;
export const REQUEST_CHOICES = ['food', 'farm', 'clothes', 'mend', 'repair', 'expand', 'later', 'decline'] as const;
export type RequestChoice = typeof REQUEST_CHOICES[number];
export const REQUEST_LABELS = { food: '다음 끼니를 부탁해요', clothing: '따뜻한 옷이 필요해요', housing: '우리 집을 돌봐 주세요' };
const score = z.number().finite().min(0).max(100);
export const requestMetricsSchema = z.object({ hunger: score, health: score, food: tick, clothing: score, warmth: score, condition: score, capacity: tick, trust: score }).strict();
export type RequestMetrics = z.infer<typeof requestMetricsSchema>;
export const residentRequestSchema = z.object({
  id, npcId: id, settlementId: id, homeId: id, kind: z.enum(REQUEST_KINDS),
  status: z.enum(['open', 'deferred', 'observing', 'completed', 'declined', 'expired', 'resolved', 'cancelled']),
  createdAt: tick, expiresAt: tick, deferredUntil: tick.optional(), reviewAt: tick.optional(), closedAt: tick.optional(),
  choice: z.enum(REQUEST_CHOICES).optional(), sourceEventId: id, lastEventId: id, decisionEventId: id.optional(), resultEventId: id.optional(), buildingId: id.optional(),
  context: z.object({ metrics: requestMetricsSchema, facts: z.array(z.string().max(300)).max(5), evidence: z.array(id).max(4) }).strict().optional(),
  followups: z.array(z.object({ days: z.union([z.literal(1), z.literal(3)]), tick, eventId: id, metrics: requestMetricsSchema, evidence: z.array(id).max(6), needRemains: z.boolean() }).strict()).max(2).optional(),
  followupStopped: id.optional(), followupSince: tick.optional(),
  before: requestMetricsSchema, immediate: requestMetricsSchema.optional(), after: requestMetricsSchema.optional(),
}).strict();
export type ResidentRequest = z.infer<typeof residentRequestSchema>;
export const requestsSchema = z.object({ since: tick, lastOffered: z.number().int().min(-1000), offeredDay: tick, offeredToday: tick.max(2), cooldowns: z.record(tick), items: z.array(residentRequestSchema).max(32) }).strict();
export type RequestsState = z.infer<typeof requestsSchema>;
export const emptyRequests = (since: number): RequestsState => ({ since, lastOffered: since - 36, offeredDay: 0, offeredToday: 0, cooldowns: {}, items: [] });
