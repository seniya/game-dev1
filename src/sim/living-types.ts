import { z } from 'zod';
export const TRAIT_LABELS = { patience: '인내심', optimism: '낙관성', frugality: '검소함', independence: '독립성' };
export const DESIRE_LABELS = { security: '안정', belonging: '소속', comfort: '안락', mastery: '성취', prosperity: '부', novelty: '새로움' };
export const BODY_LABELS = { stamina: '체력', cleanliness: '청결', warmth: '온기', pain: '통증' };
const score = z.number().finite().min(0).max(100);
export const traitsSchema = z.object({ patience: score, optimism: score, frugality: score, independence: score }).strict();
export const desiresSchema = z.object({ security: score, belonging: score, comfort: score, mastery: score, prosperity: score, novelty: score }).strict();
export const bodySchema = z.object({ stamina: score, cleanliness: score, warmth: score, pain: score }).strict();
export const livingPersonSchema = z.object({ traits: traitsSchema, desires: desiresSchema, body: bodySchema, clothing: score, furnishings: score }).strict();
export type LivingPerson = z.infer<typeof livingPersonSchema>;
export const HOME_KINDS = ['shared', 'cottage', 'courtyard', 'townhouse', 'insulated'] as const;
export type HomeKind = typeof HOME_KINDS[number];
export const HOMES: Record<HomeKind, { label: string; comfort: number; privacy: number; insulation: number; rent: number }> = {
  shared: { label: '공동주택', comfort: 45, privacy: 25, insulation: 40, rent: 1 },
  cottage: { label: '오두막', comfort: 50, privacy: 80, insulation: 25, rent: 1 },
  courtyard: { label: '마당집', comfort: 65, privacy: 55, insulation: 50, rent: 2 },
  townhouse: { label: '상가주택', comfort: 75, privacy: 45, insulation: 65, rent: 3 },
  insulated: { label: '단열주택', comfort: 80, privacy: 75, insulation: 90, rent: 4 },
};
export interface LivingState { since: number; people: Record<string, LivingPerson>; homes: Record<string, HomeKind> }
export const livingSchema = z.object({ since: z.number().int().nonnegative(), people: z.record(livingPersonSchema), homes: z.record(z.enum(HOME_KINDS)) }).strict();
