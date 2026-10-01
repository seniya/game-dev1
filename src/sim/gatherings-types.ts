import { z } from 'zod';
const id = z.string().min(1).max(100), tick = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const GATHERING_LABELS = { meal: '함께 식사', help: '이웃에게 식량 전달', harvest: '공동 수확' };
export const gatheringSchema = z.object({
  id, kind: z.enum(['meal', 'help', 'harvest']), hostId: id, settlementId: id, buildingId: id,
  createdAt: tick, startsAt: tick, endsAt: tick, status: z.enum(['planned', 'completed', 'cancelled']),
  recurring: z.object({ partnerId:id, evidence:z.array(id).min(2).max(3) }).strict().optional(),
  schedule: z.object({ eventId: id, requestEventId: id, requestedBy: id, tick, previousStart: tick }).strict().optional(),
  reason: z.string().max(1000), sourceEventId: id, lastEventId: id, evidence: z.array(id).max(4),
  invitations: z.array(z.object({ npcId: id, deliveredAt: tick, invitationEventId: id, responseEventId: id,
    senderId: id.optional(), depth: z.number().int().min(1).max(2).optional(),
    scheduleEventId: id.optional(), scheduleResponseId: id.optional(),
    status: z.enum(['accepted', 'declined', 'withdrawn', 'attended', 'missed']), reason: z.string().max(1000),
  }).strict()).max(3),
  progress: tick.max(6), attendance: z.array(id).max(4), finishedAt: tick.optional(),
  arrivals: z.array(z.object({ npcId: id, tick, eventId: id }).strict()).max(4),
}).strict();
export const circleSchema = z.object({ hostId: id, partnerId: id, kind: z.enum(['meal', 'help', 'harvest']), meetings: z.number().int().min(2).max(3), evidence: z.array(id).min(2).max(3), lastAt: tick }).strict();
export const gatheringsSchema = z.object({ items: z.array(gatheringSchema).max(36), circles: z.array(circleSchema).max(48).optional(), lastProposalDay: z.number().int().min(-1) }).strict();
export type Gathering = z.infer<typeof gatheringSchema>;
export type Gatherings = z.infer<typeof gatheringsSchema>;
export const isPlanned = (g: Gathering) => g.status === 'planned';
