import { z } from 'zod';
import { clamp } from './random';
import { YEAR_TICKS, type NPC, type WorldState } from './types';

export const SEX_LABELS = { male: '남성', female: '여성' };
export const physiqueSchema = z.object({
  sex: z.enum(['male', 'female']), heightCm: z.number().finite().min(35).max(230),
  weightKg: z.number().finite().min(1).max(250), diseaseResistance: z.number().finite().min(0).max(100),
  adultHeightCm: z.number().finite().min(130).max(230),
}).strict();
export type Physique = z.infer<typeof physiqueSchema>;
function hash(value: string) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const round = (n: number) => Math.round(n * 10) / 10;
// Stylized simulation growth, not medical reference measurements.
export function growthRatio(age: number) {
  const points = [[0,.29],[1,.43],[4,.59],[7,.71],[12,.86],[18,1]];
  for (let i=1;i<points.length;i++) if (age < points[i][0]) { const [a,v]=points[i-1], [b,u]=points[i]; return v+(u-v)*(Math.max(a,age)-a)/(b-a); }
  return 1;
}
export function newPhysique(seed: number, id: string, age: number, input: Partial<Physique> = {}): Physique {
  const h = hash(`${seed}:${id}`), sex = input.sex ?? (h % 2 ? 'female' : 'male');
  const adultHeightCm = input.adultHeightCm ?? (input.heightCm ? Math.min(230,Math.max(130,input.heightCm/growthRatio(age))) : (sex === 'male' ? 174 : 163) + (h >>> 1) % 23 - 11);
  const heightCm = input.heightCm ?? round(adultHeightCm * growthRatio(age));
  return { sex, adultHeightCm, heightCm, weightKg: input.weightKg ?? round(age < 1 ? 3.4 : heightCm * heightCm / 10000 * (age < 18 ? 16 + age / 6 : 22)), diseaseResistance: input.diseaseResistance ?? 35 + (h >>> 8) % 46 };
}
export function initializePhysiques(w: WorldState) {
  const missing = new Set(w.npcs.filter(n=>!n.physique).map(n=>n.id));
  for (const n of w.npcs) n.physique ??= newPhysique(w.seed,n.id,n.identity.age);
  // Preserve old households and history; assign only previously absent attributes.
  const people = new Map(w.npcs.map(n=>[n.id,n]));
  for (const n of w.npcs) {
    const p = n.life.partnerId ? people.get(n.life.partnerId) : undefined;
    if (p && missing.has(p.id) && p.physique!.sex===n.physique!.sex) {
      p.physique = newPhysique(w.seed,p.id,p.identity.age,{sex:n.physique!.sex==='male'?'female':'male'});
    }
  }
}
export function effectiveResistance(w: WorldState, n: NPC) {
  const nutrition = w.urban.citizens[n.id]?.nutrition ?? 65;
  return clamp((n.physique?.diseaseResistance ?? 55) + (nutrition-65)*.2 - Math.max(0,n.needs.fatigue-50)*.15 - (n.identity.age < 4 || n.identity.age >= 65 ? 10 : 0));
}
export function physiologyDay(w: WorldState, n: NPC) {
  const p = n.physique ??= newPhysique(w.seed,n.id,n.identity.age);
  const age = Math.max(0,(w.tick-n.life.bornTick)/YEAR_TICKS), u=w.urban.citizens[n.id];
  if (age <= 18) p.heightCm = round(Math.max(p.heightCm,p.adultHeightCm*growthRatio(age)));
  const target = age < 1 ? 3.4 + age*6 : p.heightCm*p.heightCm/10000*(age<18?16+age/6:22);
  const change = n.needs.hunger>70 || u?.nutrition<35 ? -.12 : Math.min(.25,Math.max(-.12,(target-p.weightKg)*.03));
  p.weightKg = round(Math.max(1,Math.min(250,p.weightKg+change)));
}
