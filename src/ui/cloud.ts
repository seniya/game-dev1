import type { Command, WorldView } from '../server/world';
export type CloudAction = Command['action'];
export class CloudClient {
  world?: WorldView;
  private queue = Promise.resolve();
  constructor(private receive: (w: WorldView) => void, private status: (message: string) => void) {}
  async get<T>(path: string): Promise<T> {
    let response: Response;
    try { response = await fetch(`/api/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('서버 응답이 지연되고 있습니다. 잠시 후 다시 연결합니다.');
      throw error;
    }
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('서버에 연결할 수 없습니다.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? '서버 응답을 확인할 수 없습니다.');
    return result as T;
  }
  accept(world: WorldView) {
    if (this.world && world.revision < this.world.revision) return;
    if (!this.world || world.revision > this.world.revision) { this.world = world; this.receive(world); }
    this.status(`서버 저장 완료 · ${world.meta.eventCount.toLocaleString()}개 사건 · 다른 기기에서 이어보기 가능`);
  }
  async connect() { this.accept(await this.get<WorldView>('world')); }
  send(action: CloudAction, commandId = crypto.randomUUID()): Promise<void> {
    const run = async () => {
      if (!this.world) throw new Error('서버 연결을 먼저 확인해 주세요.');
      const command: Command = { id: commandId, revision: this.world.revision, action };
      this.status('세계의 변화를 저장하는 중…');
      let response: Response | undefined;
      // A retry reuses the exact command ID and body after a lost response.
      for (let attempt = 0; attempt < 2; attempt++) {
        try { response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(30_000) }); break; }
        catch (e) { if (attempt) throw e; }
      }
      const result = await response!.json();
      if (!response!.ok) {
        if (result.world) this.accept(result.world);
        if (response!.status === 409 && action.type === 'sync') return;
        throw new Error(result.error ?? '서버에 저장하지 못했습니다.');
      }
      this.accept(result);
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
}
