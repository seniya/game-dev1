import { CHROME_TIMEOUT_MS, CHROME_OUTPUT_LIMIT, CHROME_CONTEXT_LIMIT, chromeResponseConstraint, type ChromeLease } from '../llm/chrome-contract';

export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface Session {
  contextWindow?: number;
  contextUsage?: number;
  measureContextUsage?(input: string, options: { signal: AbortSignal; responseConstraint: object; omitResponseConstraintInput: boolean }): Promise<number>;
  prompt(input: string, options: { signal: AbortSignal; responseConstraint: object; omitResponseConstraintInput: boolean }): Promise<string>;
  clone(options: { signal: AbortSignal }): Promise<Session>;
  destroy(): void;
}
interface ModelOptions { expectedInputs: { type: 'text'; languages: string[] }[]; expectedOutputs: { type: 'text'; languages: string[] }[] }
interface ModelAPI {
  availability(options: ModelOptions): Promise<Availability>;
  create(options: ModelOptions & { signal: AbortSignal; monitor: (monitor: { addEventListener(type: string, cb: (event: { loaded: number }) => void): void }) => void }): Promise<Session>;
}
const options: ModelOptions = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const api = () => (globalThis as typeof globalThis & { LanguageModel?: ModelAPI }).LanguageModel;
export interface DeviceState { availability: Availability | 'checking' | 'failed'; enabled: boolean; busy: boolean; progress: number; message: string }
interface DeviceAttempt {
  jobId: string; startedAt: string; elapsedMs: number; contextWindow?: number; inputUsage?: number;
  outputLength?: number; outcome: string;
}
export class ChromeRunner {
  state: DeviceState = { availability: 'checking', enabled: false, busy: false, progress: 0, message: '이 기기의 Chrome AI 지원을 확인하고 있습니다.' };
  private session?: Session;
  private controller?: AbortController;
  private running = false;
  private worldKey = '';
  private worldActive = false;
  private checkGeneration = 0;
  private attempts: DeviceAttempt[] = [];
  diagnostics() {
    return { version: 1, capturedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      secureContext: globalThis.isSecureContext, languageModelPresent: !!api(), options,
      device: { ...this.state }, attempts: this.attempts.map(a => ({ ...a })),
      verification: 'Device observations only; API availability or server acceptance does not prove Gemini Nano inference.' };
  }
  constructor(private changed: (state: DeviceState) => void, private updated: () => Promise<void>) {
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop('숨겨진 탭에서는 추론을 중단합니다. 다시 활성화해 주세요.'); });
    window.addEventListener('pagehide', () => this.stop('기기 실행을 중단했습니다.'));
  }
  private notify(message?: string) { if (message) this.state.message = message; this.changed(this.state); }
  async check() {
    if (this.state.enabled || this.running || this.controller) return;
    const generation = ++this.checkGeneration;
    try {
      const availability = api() && globalThis.isSecureContext ? await api()!.availability(options) : 'unavailable';
      if (generation !== this.checkGeneration) return;
      this.state.availability = availability;
      this.notify(({ unavailable: '이 기기에서는 Chrome AI를 사용할 수 없습니다. 다른 기기를 기다리거나 Mock / AI 끄기를 선택할 수 있습니다.', downloadable: '사용하려면 Chrome 모델 다운로드가 필요합니다.', downloading: 'Chrome 모델 다운로드가 진행 중입니다. 연결하여 진행률을 확인할 수 있습니다.', available: '사용 가능합니다. 이 기기에서 활성화하면 목표 선택을 시작합니다.' } as const)[this.state.availability]);
    } catch { if (generation === this.checkGeneration) { this.state.availability = 'failed'; this.notify('지원 확인에 실패했습니다. 다시 확인해 주세요.'); } }
  }
  setWorld(epoch: string, generation: string, active: boolean) {
    const key = `${epoch}:${generation}`;
    if ((!active || this.worldKey && key !== this.worldKey) && (this.state.enabled || this.controller)) this.stop('세계 또는 AI 방식이 변경되어 기기 실행을 중단했습니다.');
    this.worldKey = key; this.worldActive = active;
  }
  // Called synchronously from the button event so create() retains transient user activation.
  async activate() {
    if (this.controller || this.running || !this.worldActive || document.hidden || !api()) return;
    this.checkGeneration++;
    const controller = new AbortController(); this.controller = controller;
    this.state.busy = true; this.state.progress = 0;
    const timer = setTimeout(() => controller.abort(new DOMException('Download timeout', 'TimeoutError')), 600_000);
    try {
      const pending = api()!.create({ ...options, signal: controller.signal, monitor: monitor => monitor.addEventListener('downloadprogress', event => {
        if (controller.signal.aborted) return;
        this.state.availability = 'downloading'; this.state.progress = Math.min(100, Math.max(0, event.loaded * 100)); this.notify('Chrome 모델을 준비하고 있습니다.');
      }) });
      this.notify('Chrome 모델을 준비하고 있습니다. 첫 다운로드는 시간이 걸릴 수 있습니다.');
      const session = await abortable(pending, controller.signal);
      if (controller.signal.aborted) { session.destroy(); return; }
      this.session = session; this.state.enabled = true; this.state.availability = 'available'; this.notify('이 기기에서 실행 중 · 중요한 사건을 기다립니다.');
    } catch { if (this.controller === controller) { this.state.availability = 'failed'; this.notify('모델 준비에 실패했습니다. 다운로드 또는 기기 상태를 확인하고 재시도해 주세요.'); } }
    finally { clearTimeout(timer); if (this.controller === controller) { this.controller = undefined; this.state.busy = false; this.notify(); } }
  }
  stop(message = '이 기기에서 실행을 중단했습니다. 다른 기기의 설정은 유지됩니다.') {
    this.checkGeneration++;
    this.controller?.abort(); this.controller = undefined; this.session?.destroy(); this.session = undefined;
    this.state.enabled = false; this.state.busy = false; this.notify(message);
  }
  async tick() {
    if (this.running || !this.state.enabled || !this.session || !this.worldActive || document.hidden) return;
    this.running = true; this.state.busy = true;
    const controller = new AbortController(); this.controller = controller;
    let lease: ChromeLease | null = null, session: Session | undefined, submission: object | undefined;
    let attempt: DeviceAttempt | undefined;
    const started = performance.now();
    const timer = setTimeout(() => controller.abort(new DOMException('Inference timeout', 'TimeoutError')), CHROME_TIMEOUT_MS);
    try {
      lease = (await this.post<{ lease: ChromeLease | null }>('claim', {}, controller.signal)).lease;
      if (!lease) { this.notify('이 기기에서 대기 중 · 새 사건, 다른 기기의 처리 또는 일일 상한을 기다립니다.'); return; }
      attempt = { jobId: lease.id, startedAt: new Date().toISOString(), elapsedMs: 0, outcome: 'running' };
      this.attempts.push(attempt); this.attempts = this.attempts.slice(-20);
      controller.signal.throwIfAborted();
      if (JSON.stringify(lease.context).length > CHROME_CONTEXT_LIMIT) throw new DOMException('Context limit', 'QuotaExceededError');
      this.notify('Chrome AI가 목표를 선택하고 있습니다. 세계는 계속 진행됩니다.');
      // Clone an empty session for each resident; never retain another resident's context.
      session = await abortable(this.session!.clone({ signal: controller.signal }), controller.signal);
      const prompt = `Choose 1-2 goals from choices. Cite trigger.id. Hearsay is unverified. Return JSON only: {"goals":[{"kind":"allowed kind","reasonCode":"allowed code","evidence":["event ID"]}]}.\n${JSON.stringify(lease.context)}`;
      const promptOptions = { signal: controller.signal, responseConstraint: chromeResponseConstraint(lease.context), omitResponseConstraintInput: true };
      attempt.contextWindow = session.contextWindow;
      if (session.measureContextUsage) {
        attempt.inputUsage = await abortable(session.measureContextUsage(prompt, promptOptions), controller.signal);
        if (session.contextWindow !== undefined && attempt.inputUsage + (session.contextUsage ?? 0) >= session.contextWindow) throw new DOMException('Context limit', 'QuotaExceededError');
      }
      const output = await abortable(session.prompt(prompt, promptOptions), controller.signal);
      attempt.outputLength = output.length;
      const { context: _context, expires: _expires, ...envelope } = lease;
      submission = output.length > CHROME_OUTPUT_LIMIT ? { ...envelope, error: 'output_too_large' } : { ...envelope, output };
    } catch (error) {
      const code = controller.signal.aborted ? controller.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled' : error instanceof DOMException && error.name === 'QuotaExceededError' ? 'context_limit' : 'device_error';
      if (attempt) attempt.outcome = code;
      if (lease) { const { context: _context, expires: _expires, ...envelope } = lease; submission = { ...envelope, error: code }; }
      if (this.controller === controller) { this.stop(code === 'context_limit' ? '기기 실행에 실패했습니다. 사건 입력이 이 기기 모델의 처리 한도를 초과했습니다. 진단 기록을 확인해 주세요.' : '기기 실행에 실패했습니다. 활성화 버튼으로 다시 시도할 수 있습니다.'); this.state.availability = 'failed'; }
    } finally {
      clearTimeout(timer); session?.destroy();
      if (submission) {
        // Retry only the identical saved output on network loss. Never repeat inference here.
        for (let retry = 0; retry < 2; retry++) {
          try { const result = await this.post<{ state: string }>('result', submission, AbortSignal.timeout(10_000)); if (attempt?.outcome === 'running') attempt.outcome = result.state; if (this.state.enabled) this.notify(result.state === 'applied' ? '서버가 목표와 근거를 검증해 반영했습니다.' : '서버에 결과를 저장했습니다. 처리 기록에서 확인할 수 있습니다.'); break; }
          catch (error) { if (error instanceof Rejected || retry) {
            if (attempt?.outcome === 'running') attempt.outcome = error instanceof Rejected ? error.status === 422 ? 'invalid_output' : 'server_rejected' : 'connection_failed';
            if (error instanceof Rejected && error.status === 422 && this.controller === controller) {
              this.stop('서버가 모델 응답의 목표·근거를 거부했습니다. 기기 실행을 중단했으니 처리 기록을 확인한 뒤 다시 활성화해 주세요.'); this.state.availability = 'failed';
            } else if (this.state.enabled) this.notify('결과를 반영하지 못했습니다. 서버 처리 기록을 확인해 주세요.');
            break;
          } }
        }
        await this.updated().catch(() => {});
      }
      if (attempt) attempt.elapsedMs = Math.round(performance.now() - started);
      if (this.controller === controller) this.controller = undefined;
      this.running = false; this.state.busy = false; this.notify();
    }
  }
  private async post<T>(path: string, body: object, signal: AbortSignal): Promise<T> {
    const response = await fetch(`/api/chrome/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!response.ok) throw new Rejected(response.status);
    return response.json() as Promise<T>;
  }
}
class Rejected extends Error { constructor(readonly status: number) { super('Server rejected request'); } }
function abortable<T extends Session | string | number>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) { if (typeof value === 'object') value.destroy(); reject(signal.reason); } else resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
