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
export const characterSchema = z.object({
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
  greetId: z.string().min(1).max(100).optional(),
}).strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export type CharacterInput = z.infer<typeof characterSchema>;
export const profileSchema = z.object({ commandId: z.string().uuid().optional(), background: z.string().max(300), appearance: appearanceSchema, createdAt: z.number().int().nonnegative(), arrivalEventId: z.string().min(1).max(100) }).strict();
