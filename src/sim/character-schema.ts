import { ambitionSchema } from './ambition';
import { OCCUPATIONS, type Occupation } from './types';
import { traitsSchema, desiresSchema, bodySchema } from './living-types';
import { z } from 'zod';
const score = z.number().int().min(0).max(100);
export const appearanceSchema = z.object({
  skin: z.string().regex(/^#[0-9a-fA-F]{6}$/), hair: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  outfit: z.string().regex(/^#[0-9a-fA-F]{6}$/), hairstyle: z.enum(['short', 'long', 'curly', 'bald', 'bob', 'ponytail', 'bun', 'braid', 'spiky']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  clothing: z.enum(['plain','stripes','overalls','vest','dress']).optional(),
  expression: z.enum(['smile','calm','bright']).optional(),
  faceMark: z.enum(['none','freckles','blush','beard']).optional(),
  backdrop: z.enum(['meadow','sunset','night']).optional(),
  accessory: z.enum(['none', 'glasses', 'hat', 'scarf', 'earrings', 'flower', 'headphones']),
}).strict();
export const NPC_CREATION_LIMIT = 5;
export const CREATION_DEFAULTS = {
  traits: { patience: 60, optimism: 65, frugality: 50, independence: 45 },
  desires: { security: 35, belonging: 60, comfort: 30, mastery: 40, prosperity: 30, novelty: 40 },
  body: { stamina: 85, cleanliness: 80, warmth: 80, pain: 0 },
};
const characterFields = z.object({
  ambition: ambitionSchema.optional(),
  name: z.string().trim().min(1).max(40), age: z.number().int().min(0).max(80),
  background: z.string().trim().max(300), homeId: z.string().min(1).max(100),
  occupation: z.enum(Object.keys(OCCUPATIONS) as [Occupation, ...Occupation[]]),
  goal: z.enum(['secure_food', 'help_neighbor', 'earn_wealth', 'expand_farm', 'secure_storage', 'build_home', 'make_friend']),
  appearance: appearanceSchema,
  traits: traitsSchema.optional(), desires: desiresSchema.optional(), body: bodySchema.optional(),
  needs: z.object({ hunger: score, thirst: score, fatigue: score, health: score.min(1), safety: score, social: score }).strict(),
  personality: z.object({ diligence: score, greed: score, sociability: score, aggression: score, empathy: score, curiosity: score }).strict(),
  skill: score, education: score,
  skills: z.object({ field: score, quarry: score, mine: score, mill: score, smith: score }).strict(),
  food: z.number().int().min(0).max(100), wood: z.number().int().min(0).max(100), wealth: z.number().int().min(0).max(1000),
  bonds: z.array(z.object({ npcId: z.string().min(1).max(100), familiarity: z.number().int().min(0).max(60) }).strict()).max(4).optional(),
  greetId: z.string().min(1).max(100).optional(),
}).strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export type CharacterInput = z.infer<typeof characterFields>;
const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
export function creationBudgets(a: CharacterInput) {
  const body = a.body ?? CREATION_DEFAULTS.body;
  return [
    { key: 'skill', label: '능력', used: a.skill + a.education + sum(a.skills), limit: 200 },
    { key: 'personality', label: '성격', used: sum(a.personality) + sum(a.traits ?? CREATION_DEFAULTS.traits), limit: 600 },
    { key: 'desires', label: '욕망', used: sum(a.desires ?? CREATION_DEFAULTS.desires), limit: 300 },
    { key: 'needs', label: '컨디션', used: 300 - a.needs.hunger - a.needs.thirst - a.needs.fatigue + a.needs.health + a.needs.safety + a.needs.social + body.stamina + body.cleanliness + body.warmth + 100 - body.pain, limit: 850 },
    { key: 'wealth', label: '자산', used: a.wealth + (a.food + a.wood) * 5, limit: 500 },
    { key: 'bonds', label: '시작 친밀도', used: (a.bonds ?? []).reduce((sum, b) => sum + b.familiarity, 0), limit: 120 },
  ];
}
export const characterSchema = characterFields.superRefine((a, ctx) => {
  for (const b of creationBudgets(a)) if (b.used > b.limit) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [b.key], message: `${b.label} 총합은 ${b.limit}점까지입니다. 현재 ${b.used}점입니다.` });
  if (new Set(a.bonds?.map(b => b.npcId)).size !== (a.bonds?.length ?? 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bonds'], message: '같은 주민의 친밀도를 중복 설정할 수 없습니다.' });
});
export const profileSchema = z.object({ commandId: z.string().uuid().optional(), background: z.string().max(300), appearance: appearanceSchema, createdAt: z.number().int().nonnegative(), arrivalEventId: z.string().min(1).max(100) }).strict();
