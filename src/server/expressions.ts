import { z } from 'zod';
import { expressionContext, expressionRequest, validateExpression, type ExpressionContext } from '../llm/expression';
import { Simulation } from '../sim/engine';
import { Conflict, type WorldStore } from './store';
import { compactWorld } from './world';
import { modelConfig, ServerModelProvider, type ModelEnv } from './model';

interface Job {
  id: string;
  member: string;
  epoch: string;
  generation: string;
  mode: string;
  context: string;
  token: string;
  expires: number;
  created: number;
  status: string;
  result: string | null;
}
const guard = (s: WorldStore) => [
  s.db.prepare('INSERT INTO commit_guard VALUES(changes())'),
  s.db.prepare('DELETE FROM commit_guard'),
];
const envelope = z.object({ id: z.string().uuid(), token: z.string().uuid(), output: z.string().max(4000) }).strict();
async function finish(s: WorldStore, j: Job, raw: unknown, now: number) {
  const result = validateExpression(raw, JSON.parse(j.context));
  if (j.status !== 'applied' && (j.status !== 'running' || j.expires <= now)) throw new Error('주민 표현 실행권이 만료되었습니다.');
  for (let retry = 0; retry < 3; retry++) {
    const w = await s.read();
    if (
      w.epoch !== j.epoch ||
      (w.meta.aiGeneration ?? 'legacy') !== j.generation ||
      (w.meta.aiMode ?? (w.state.llm.enabled ? 'mock' : 'off')) !== j.mode ||
      !w.state.llm.enabled
    )
      throw new Error('주민 표현 도중 세계 또는 AI 설정이 바뀌었습니다.');
    if(j.status==='applied'){if(j.result!==JSON.stringify(result))throw new Error('주민 표현의 기존 결과와 다릅니다.');return {id:j.id,applied:true,result};}
    const context = JSON.parse(j.context) as ExpressionContext;
    const sim = Simulation.load(JSON.stringify(w.state));
    if (
      !sim.recordExpression(context.npcId, context.kind, result.text, result.evidence, j.id, j.mode, context.question)
    )
      throw new Error('주민 표현의 기억 또는 생존 상태가 바뀌었습니다.');
    const state = sim.snapshot(),
      ids = new Set(w.state.events.map((e) => e.id)),
      events = state.events.filter((e) => !ids.has(e.id));
    try {
      await s.commit(
        {
          ...w,
          revision: w.revision + 1,
          state: compactWorld(state),
          meta: { ...w.meta, eventCount: w.meta.eventCount + events.length },
        },
        events,
        `expression:${j.id}`,
        `expression:${j.id}`,
        [
          s.db
            .prepare("UPDATE expressions SET status='applied',result=? WHERE id=? AND status='running' AND expires>?")
            .bind(JSON.stringify(result), j.id, now),
          ...guard(s),
        ],
      );
      return { id:j.id, applied: true, result };
    } catch (e) {
      if (!(e instanceof Conflict) || retry === 2) throw e;
    }
  }
}
export async function expressionAPI(s: WorldStore, member: string, raw: unknown, env: ModelEnv, now = Date.now()) {
  if (raw && typeof raw === 'object' && 'output' in raw) {
    const p = envelope.safeParse(raw);
    if (!p.success) throw new Error('주민 표현 응답을 확인해 주세요.');
    const j = await s.db
      .prepare('SELECT * FROM expressions WHERE id=? AND member=? AND token=?')
      .bind(p.data.id, member, p.data.token)
      .first<Job>();
    if (!j || j.mode !== 'chrome') throw new Error('주민 표현 실행권을 찾을 수 없습니다.');
    let outcome = 'rejected';
    try {
      const result = await finish(s, j, JSON.parse(p.data.output), now);
      outcome = 'applied';
      return result;
    } finally {
      if (j.status === 'running')
        await s.db.batch([
          s.db.prepare('UPDATE chrome_calls SET outcome=? WHERE token=?').bind(outcome, j.token),
          s.db.prepare('UPDATE chrome_lock SET expires=? WHERE token=?').bind(now, j.token),
          s.db
            .prepare(
              'UPDATE chrome_schedule SET next_after=? WHERE id=1 AND EXISTS(SELECT 1 FROM chrome_lock WHERE token=?)',
            )
            .bind(now + 60_000, j.token),
          ...(outcome === 'rejected'
            ? [s.db.prepare("UPDATE expressions SET status='rejected' WHERE id=? AND status='running'").bind(j.id)]
            : []),
        ]);
    }
  }
  const p = expressionRequest.safeParse(raw);
  if (!p.success) throw new Error('주민 표현 질문을 확인해 주세요.');
  const w = await s.read(),
    mode = w.meta.aiMode ?? (w.state.llm.enabled ? 'mock' : 'off');
  if (mode === 'off' || !w.state.llm.enabled) throw new Error('주민 표현은 AI 모드를 선택한 뒤 사용할 수 있습니다.');
  const context = expressionContext(w.state, p.data),
    config = modelConfig(env);
  if(p.data.previous) {
    const previous=await s.db.prepare("SELECT * FROM expressions WHERE id=? AND member=? AND epoch=? AND generation=? AND mode=? AND status='applied' AND created>=?").bind(p.data.previous,member,w.epoch,w.meta.aiGeneration??'legacy',mode,now-7*86400000).first<Job>();
    if(!previous)throw new Error('주민 대화가 만료되었거나 세계·AI 설정이 바뀌었습니다. 새 대화를 시작해 주세요.');
    const before=JSON.parse(previous.context) as ExpressionContext;
    if(before.npcId!==context.npcId || before.kind!==context.kind)throw new Error('주민 대화의 상대 또는 종류가 다릅니다.');
    context.history=[...(before.history??[]),{question:before.question,text:JSON.parse(previous.result!).text}].slice(-4);
  }
  if (mode === 'remote' && !config) throw new Error('주민 표현을 위한 외부 API가 연결되지 않았습니다.');
  const id = crypto.randomUUID(),
    token = crypto.randomUUID(),
    expires = now + 90_000,
    day = new Date(now).toISOString().slice(0, 10);
  const j: Job = {
    id,
    member,
    epoch: w.epoch,
    generation: w.meta.aiGeneration ?? 'legacy',
    mode,
    context: JSON.stringify(context),
    token,
    expires,
    created: now,
    status: 'running',
    result: null,
  };
  const reservation = [];
  if (mode === 'chrome')
    reservation.push(
      s.db.prepare('UPDATE chrome_schedule SET next_after=? WHERE id=1 AND next_after<=?').bind(expires + 60_000, now),
      ...guard(s),
      s.db
        .prepare(
          'INSERT INTO chrome_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE chrome_lock.expires<=?',
        )
        .bind(token, expires, now),
      ...guard(s),
      s.db
        .prepare(
          'INSERT INTO chrome_calls(token,job,day,started) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM chrome_calls WHERE day=?)<36 AND (SELECT COUNT(*) FROM chrome_calls WHERE started>?)<6',
        )
        .bind(token, id, day, now, day, now - 3_600_000),
      ...guard(s),
    );
  if (mode === 'remote')
    reservation.push(
      s.db
        .prepare(
          'INSERT INTO ai_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE ai_lock.expires<=?',
        )
        .bind(token, expires, now),
      ...guard(s),
      s.db
        .prepare(
          'INSERT INTO ai_calls(id,job,day,started) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ai_calls WHERE day=?)<?',
        )
        .bind(token, id, day, now, day, config!.dailyLimit),
      ...guard(s),
    );
  try {
    await s.db.batch([
      ...reservation,
      s.db
        .prepare("INSERT INTO expressions VALUES(?,?,?,?,?,?,?,?,?,'running',NULL)")
        .bind(id, member, j.epoch, j.generation, mode, j.context, token, expires, now),
    ]);
  } catch (e) {
    if (/CHECK constraint/.test(String(e))) throw new Error('주민 표현의 호출 간격 또는 오늘 한도에 도달했습니다.');
    throw e;
  }
  if (mode === 'chrome') return { id, token, context, expires };
  let outcome = 'failed';
  const provider = mode === 'remote' ? new ServerModelProvider(config!) : undefined;
  try {
    const result =
      mode === 'mock'
        ? {
            text: `${context.history?.length ? '앞선 이야기에 이어, ' : ''}${context.kind === 'reflection' ? '기억을 돌아보면' : '내가 기억하는 일은'} ${context.memories[0].hearsay ? '확인되지 않은 소문이야. ' : ''}${context.memories[0].text}`.slice(
              0,
              500,
            ),
            evidence: [context.memories[0].id],
          }
        : await provider!.generateExpression(context);
    const applied = await finish(s, j, result, Date.now());
    outcome = 'applied';
    return applied;
  } finally {
    if (mode === 'remote')
      await s.db.batch([
        s.db
          .prepare('UPDATE ai_calls SET outcome=?,input_tokens=?,output_tokens=? WHERE id=?')
          .bind(outcome, provider?.usage.inputTokens ?? 0, provider?.usage.outputTokens ?? 0, token),
        s.db.prepare('UPDATE ai_lock SET expires=? WHERE token=?').bind(Date.now(), token),
      ]);
    if (outcome === 'failed')
      await s.db.batch([
        s.db.prepare("UPDATE expressions SET status='failed' WHERE id=? AND status='running'").bind(id),
      ]);
  }
}
