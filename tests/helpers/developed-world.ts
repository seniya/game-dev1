import { OCCUPATIONS, type WorldState } from '../../src/sim/types';
import { Simulation } from '../../src/sim/engine';
/** Explicit mature-settlement fixture for recipe/accounting tests, independent of unlock tests. */
export function developed(w:WorldState) {
  if(w.villageLife)for(const d of Object.values(w.villageLife.settlements)){d.stage=4;d.proposed=4;d.streak=2;d.unlocked=Object.keys(OCCUPATIONS);}
  return w;
}
export function developedSimulation(seed=42,population=12) {return Simulation.load(JSON.stringify(developed(new Simulation(seed,population).snapshot())));}
