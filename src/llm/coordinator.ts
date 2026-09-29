import type { Simulation } from '../sim/engine';
import type { LLMProvider } from './provider';

export class DecisionCoordinator {
  private busy = false;
  private disposed = false;
  constructor(private sim: Simulation, private provider: LLMProvider, private timeoutMs = 5000) {}
  dispose() { this.disposed = true; }
  async processOne(): Promise<boolean> {
    if (this.busy || this.disposed) return false;
    const pending = this.sim.decisionContext(); if (!pending) return false;
    this.busy = true; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.provider.interpretEvent(pending.context),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('provider timeout')), this.timeoutMs); }),
      ]);
      if (!this.disposed) this.sim.applyInterpretation(pending.requestId, result);
    } catch (error) {
      if (!this.disposed) this.sim.failDecision(pending.requestId, error instanceof Error ? error.message : 'provider error');
    } finally { clearTimeout(timer); this.busy = false; }
    return true;
  }
  async drain() { while (!this.disposed && await this.processOne()) { /* serial, bounded by saved queue and retry limits */ } }
}
