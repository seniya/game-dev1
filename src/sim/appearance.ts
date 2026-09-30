import type { NPC } from './types';
import type { Appearance } from './character-schema';
const COLORS = ['#e5a85f', '#d98175', '#76b4a3', '#a893c4', '#739eb7', '#d1b154', '#91a767', '#c6859f', '#71918d', '#b19a83', '#bb8b57', '#95a2c7'];
export function appearance(n: NPC): Appearance {
  return n.profile?.appearance ?? { skin: '#ebcba4', hair: '#5d5345', outfit: COLORS[Number(n.id.replace('npc', '')) % COLORS.length] ?? COLORS[0], hairstyle: 'short', accessory: 'none' };
}
