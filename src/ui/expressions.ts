import {
  expressionInstruction,
  expressionFormat,
  type ExpressionRequest,
  type ExpressionContext,
  type ExpressionResult,
} from '../llm/expression';
import { postJSON } from './uploads';
interface Session {
  prompt(input: string, options: object): Promise<string>;
  destroy(): void;
}
interface API {
  create(options: object): Promise<Session>;
}
export async function generateExpression(input: ExpressionRequest, mode: string, progress: (text: string) => void) {
  if (mode !== 'chrome') {
    progress(
      mode === 'remote' ? '선택한 외부 API로 표현을 준비하고 있습니다…' : '기억을 바탕으로 예시를 준비하고 있습니다…',
    );
    return postJSON<{ applied: boolean; result: ExpressionResult }>('expressions', input);
  }
  const api = (globalThis as typeof globalThis & { LanguageModel?: API }).LanguageModel;
  if (!api)
    throw new Error('이 기기에서 Chrome 한국어 표현을 지원하지 않습니다. AI 설정에서 Mock을 선택할 수 있습니다.');
  const controller = new AbortController();
  let session: Session | undefined;
  const hide = () => {
    if (document.hidden) controller.abort();
  };
  document.addEventListener('visibilitychange', hide);
  let timer = setTimeout(() => controller.abort(), 180_000);
  try {
    // create is called directly during the user's click. Korean support is checked separately from English goal selection.
    const pending = api.create({
      expectedInputs: [{ type: 'text', languages: ['ko', 'en'] }],
      expectedOutputs: [{ type: 'text', languages: ['ko'] }],
      signal: controller.signal,
    });
    pending.then(
      (s) => {
        if (controller.signal.aborted) s.destroy();
      },
      () => {},
    );
    progress('이 기기에서 한국어 모델을 준비하고 있습니다…');
    session = await abortable(pending, controller.signal);
    controller.signal.throwIfAborted();
    const lease = await postJSON<{ id: string; token: string; context: ExpressionContext }>('expressions', input);
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), 60_000);
    progress('Chrome이 기억에 근거한 한국어 표현을 만들고 있습니다…');
    const output = await abortable(
      session.prompt(expressionInstruction + '\n' + JSON.stringify(lease.context), {
        signal: controller.signal,
        responseConstraint: expressionFormat,
      }),
      controller.signal,
    );
    controller.signal.throwIfAborted();
    return await postJSON<{ applied: boolean; result: ExpressionResult }>('expressions', {
      id: lease.id,
      token: lease.token,
      output,
    });
  } catch (e) {
    controller.abort();
    if (e instanceof Error && /주민/.test(e.message)) throw e;
    throw new Error('Chrome 한국어 표현을 완료하지 못했습니다. 기기 지원·다운로드·시간 초과 여부를 확인해 주세요.');
  } finally {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', hide);
    session?.destroy();
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Cancelled'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
