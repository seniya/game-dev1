import { personalObservation } from './personal-observation';
import { identity, memberFor, claimLegacyResidents, requireOwner, authorizeCommand, sessionView, checkCreation, creationStatements, AccessError, type AccessEnv } from './access';
import { readObserver } from './observation';
import { readHistory, streamWorld } from './history';
import { summarize } from '../sim/engine';
import type { D1Database, Fetcher, ExecutionContext } from '@cloudflare/workers-types';
import { applyCommand, commandSchema, viewWorld } from './world';
import { Conflict } from './store';
import { LiveWorldStore } from './live-store';
import type { WorldEvent } from '../sim/types';
import { aiStatus, processAI } from './ai';
import { claimChrome, processChrome, submitChrome, chromeSubmissionSchema } from './chrome';
import { modelConfig, type ModelEnv } from './model';
import { chromeSchedule } from './chrome-schedule';
import { CHROME_COLLECT_MS } from '../llm/chrome-contract';

interface Env extends ModelEnv, AccessEnv { DB: D1Database; ASSETS: Fetcher }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const parseEvent = (row: { body: string }) => JSON.parse(row.body) as WorldEvent;
export default {
  async fetch(request: Request, env: Env, context?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request as never) as unknown as Promise<Response>;
    // Sites dispatch authenticates invited visitors and strips spoofed identity headers.
    // JSON-only, same-origin writes also prevent cross-site form submissions.
    if (request.method !== 'GET' && (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json'))) return json({ error: '같은 사이트의 JSON 요청만 허용됩니다.' }, 403);
    if (!env.DB) return json({ error: '세계 저장소에 연결하지 못했습니다.' }, 503);
    const store = new LiveWorldStore(env.DB);
    const wakeAI = () => { if (context) context.waitUntil(Promise.all([processChrome(new LiveWorldStore(env.DB)), processAI(new LiveWorldStore(env.DB), env)]).catch(() => { console.error('AI background processing failed'); })); };
    try {
      const principal = identity(request, env);
      await store.init(Date.now());
      const member = await memberFor(env.DB, principal);
      await claimLegacyResidents(env.DB, member, () => store.read());
      if (url.pathname === '/api/session' && request.method === 'GET') return json(await sessionView(env.DB, member, await store.read(), principal.local));
      if (url.pathname === '/api/personal-observation') {
        if (request.method === 'GET') return json(await personalObservation(env.DB, member, await store.read()));
        if (request.method === 'POST') {
          const body = await request.text();
          if (body.length > 2000) return json({ error:'관찰 요청이 너무 큽니다.' },413);
          return json(await personalObservation(env.DB, member, await store.read(), JSON.parse(body)));
        }
      }
      if (url.pathname === '/api/members') {
        requireOwner(member);
        if (request.method === 'GET') return json({ members: (await env.DB.prepare('SELECT id,name,email,role,blocked FROM world_members ORDER BY role,name LIMIT 200').all()).results });
        if (request.method === 'POST') {
          const body = await request.text(); if (body.length > 1500) return json({ error: '참여자 요청이 너무 큽니다.' }, 413);
          const input = JSON.parse(body);
          if (typeof input.id !== 'string' || typeof input.blocked !== 'boolean' || input.id === member.id) return json({ error: '참여자 설정을 확인해 주세요.' }, 400);
          await env.DB.batch([env.DB.prepare("UPDATE world_members SET blocked=? WHERE id=? AND role='participant'").bind(input.blocked ? 1 : 0, input.id)]);
          return json({ ok: true });
        }
      }
      if (url.pathname.startsWith('/api/chrome/') || url.pathname.startsWith('/api/ai/jobs/') || url.pathname.startsWith('/api/export')) requireOwner(member);
      if (url.pathname === '/api/world' && request.method === 'GET') { const world = await store.read(); wakeAI(); return json(viewWorld(world)); }
      if (url.pathname === '/api/ai' && request.method === 'GET') return json(await aiStatus(env.DB, env));
      if (url.pathname === '/api/chrome/claim' && request.method === 'POST') {
        const body = await request.text();
        if (body !== '{}') return json({ error: '실행권 요청 형식이 올바르지 않습니다.' }, 400);
        const lease = await claimChrome(store);
        const waiting = await chromeSchedule(env.DB);
        if (!lease && waiting.reason === 'ready') {
          const pending = await env.DB.prepare("SELECT MIN(created) AS created FROM chrome_jobs WHERE status='pending'").first<{ created: number | null }>();
          waiting.reason = pending?.created != null ? 'collecting' : 'idle';
          if (pending?.created != null) waiting.nextAt = Math.max(waiting.nextAt, pending.created + CHROME_COLLECT_MS);
        }
        return json({ lease, waiting });
      }
      if (url.pathname === '/api/chrome/result' && request.method === 'POST') {
        if (Number(request.headers.get('Content-Length')) > 6000) return json({ error: '응답 크기를 초과했습니다.' }, 413);
        const body = await request.text();
        if (body.length > 6000) return json({ error: '응답 크기를 초과했습니다.' }, 413);
        const parsed = chromeSubmissionSchema.safeParse(JSON.parse(body));
        if (!parsed.success) return json({ error: 'Chrome 응답 형식이 올바르지 않습니다.' }, 400);
        const result = await submitChrome(store, parsed.data);
        return json(result, result.status);
      }
      if (url.pathname.startsWith('/api/chrome/jobs/') && request.method === 'GET') {
        const job = await env.DB.prepare('SELECT id,epoch,generation,request,context,hash,status,attempts,result,error,created,updated FROM chrome_jobs WHERE id=?').bind(decodeURIComponent(url.pathname.slice('/api/chrome/jobs/'.length))).first();
        if (!job) return json({ error: '판단 기록을 찾을 수 없습니다.' }, 404);
        const calls = await env.DB.prepare('SELECT day,started,outcome FROM chrome_calls WHERE job=? ORDER BY started').bind(job.id).all();
        const batch = await env.DB.prepare('SELECT requests,npc,topic FROM chrome_batches WHERE job=?').bind(job.id).first();
        return json({ ...job, model: 'chrome-built-in', batch, calls: calls.results });
      }
      if (url.pathname.startsWith('/api/ai/jobs/') && request.method === 'GET') {
        const job = await env.DB.prepare('SELECT * FROM ai_jobs WHERE id=?').bind(decodeURIComponent(url.pathname.slice('/api/ai/jobs/'.length))).first();
        if (!job) return json({ error: '판단 기록을 찾을 수 없습니다.' }, 404);
        const calls = await env.DB.prepare('SELECT day,started,input_tokens,output_tokens,outcome FROM ai_calls WHERE job=? ORDER BY started').bind(job.id).all();
        return json({ ...job, calls: calls.results });
      }
      if (url.pathname === '/api/command' && request.method === 'POST') {
        if (Number(request.headers.get('Content-Length')) > 12_000_000) return json({ error: '서버 가져오기는 10MB까지 지원합니다.' }, 413);
        const body = await request.text();
        if (body.length > 12_000_000) return json({ error: '서버 가져오기는 10MB까지 지원합니다.' }, 413);
        const parsed = commandSchema.safeParse(JSON.parse(body));
        if (!parsed.success) return json({ error: '명령 형식이 올바르지 않습니다.' }, 400);
        const command = parsed.data;
        authorizeCommand(member, command);
        if ((command.action.type === 'history-ai' || command.action.type === 'ai-mode' && command.action.mode === 'remote') && !modelConfig(env)) return json({ error: '서버 모델이 연결되지 않았습니다. 모델 주소와 이름을 먼저 설정해 주세요.' }, 400);
        if (command.action.type === 'sync') {
          try {
            const result = await store.sync(command, Date.now());
            wakeAI(); return json(viewWorld(result.world, result.motion));
          } catch (e) { if (e instanceof Conflict) return json({ error: e.message, world: viewWorld(await store.read()) }, 409); throw e; }
        }
        const canonical = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ member: member.id, command }))))).map(b => b.toString(16).padStart(2, '0')).join('');
        const previous = await store.command(command.id);
        if (previous) {
          if (previous.body !== canonical) return json({ error: '이미 사용된 명령 ID입니다.' }, 409);
          wakeAI(); return json(viewWorld(await store.read()));
        }
        const current = await store.read();
        if (command.revision !== current.revision) return json({ error: '다른 기기의 최신 상태를 반영했습니다. 변경을 다시 선택해 주세요.', world: viewWorld(current) }, 409);
        if (command.action.type === 'create-character') await checkCreation(env.DB, member, current);
        const acceptedAt = Date.now();
        const { world, events, motion } = await applyCommand(current, command, acceptedAt);
        try { await store.commit(world, events, canonical, command.id, creationStatements(env.DB, member, world, command), { action: command.action, at: acceptedAt }); }
        catch (e) { if (e instanceof Conflict) return json({ error: e.message, world: viewWorld(await store.read()) }, 409); throw e; }
        wakeAI(); return json(viewWorld(world, motion));
      }
      const observed = await store.read(), archive = store.archive();
      if (url.pathname === '/api/observer' && request.method === 'GET') return json(await readObserver(store, observed, url.searchParams));
      if (url.pathname === '/api/history' && request.method === 'GET') return json(await readHistory(store, observed, url.searchParams));
      if (url.pathname === '/api/export-stream' && request.method === 'GET') return streamWorld(store, observed);
      if (url.pathname === '/api/export' && request.method === 'GET') {
        const current = observed, epoch = url.searchParams.has('backup') ? current.meta.backupEpoch : current.epoch;
        if (!epoch) return json({ error: '초기화 전 백업이 없습니다.' }, 404);
        return json(await store.export(epoch));
      }
      if (url.pathname === '/api/report' && request.method === 'GET') {
        const w = observed; return json({ ...summarize(w.state), events: w.meta.eventCount });
      }
      if (url.pathname === '/api/observations' && request.method === 'GET') {
        const w = observed; return json({ seed: w.state.seed, since: w.state.economy.since, daily: w.state.economy.daily, urban: w.state.urban.samples });
      }
      if (url.pathname === '/api/events' && request.method === 'GET') {
        const current = observed, p = url.searchParams;
        if (p.get('epoch') && p.get('epoch') !== current.epoch) return json({ error: '세계가 교체되었습니다. 새로고침해 주세요.' }, 409);
        const clauses = ['e.epoch=?', 'e.seq<=?'], values: (string | number)[] = [current.epoch, current.meta.eventCount];
        const npc = p.get('npc');
        if (npc) { clauses.push('EXISTS(SELECT 1 FROM participants p WHERE p.epoch=e.epoch AND p.event=e.id AND p.npc=?)'); values.push(npc); }
        for (const [key, sql] of [['before', 'e.seq < ?'], ['from', 'e.tick >= ?'], ['to', 'e.tick <= ?']] as const) {
          const raw = p.get(key); if (raw !== null) { const value = Number(raw); if (!Number.isSafeInteger(value) || value < 0) return json({ error: '날짜 또는 페이지가 올바르지 않습니다.' }, 400); clauses.push(sql); values.push(value); }
        }
        if (p.get('q')) { clauses.push("e.body LIKE ? ESCAPE '\\'"); values.push(`%${p.get('q')!.slice(0, 200).replace(/[\\%_]/g, '\\$&')}%`); }
        if (p.get('cause')) { clauses.push('e.cause=?'); values.push(p.get('cause')!); }
        const filter = p.get('filter');
        if (filter === 'important') clauses.push("(json_extract(e.body,'$.importance')>=45 OR e.kind='weather')");
        if (filter === 'social') clauses.push("e.kind IN ('gathering','request','share','talk','witness','rumor','relationship','memory','family','birth','coming_of_age','education','migration','death')");
        if (filter === 'economy') clauses.push("e.kind IN ('production','storage','trade','loan','repayment','default','theft','scarcity','wage','price','project','consumption','experiment','inheritance','construction','settlement','caravan','occupation','industry','public_service','tax','urban','policy','freight','ecology','council','diplomacy','request')");
        if (filter === 'life') clauses.push("(e.kind NOT IN ('arrival','memory','failure') OR json_extract(e.body,'$.data.createdCharacter')=1)");
        const rows = await archive.prepare(`SELECT e.body,e.seq FROM events e WHERE ${clauses.join(' AND ')} ORDER BY e.seq DESC LIMIT 41`).bind(...values).all<{ body: string; seq: number }>();
        return json({ epoch: current.epoch, eventCount: current.meta.eventCount, cursors: Object.fromEntries(rows.results.slice(0, 40).map(r => [parseEvent(r).id, r.seq])), events: rows.results.slice(0, 40).map(parseEvent), next: rows.results.length > 40 ? rows.results[39].seq : null });
      }
      if (url.pathname.startsWith('/api/events/') && request.method === 'GET') {
        const current = observed, id = decodeURIComponent(url.pathname.slice('/api/events/'.length));
        if (url.searchParams.get('epoch') !== current.epoch) return json({ error: '세계가 교체되었습니다. 최신 세계에서 다시 선택해 주세요.' }, 409);
        const find = async (id: string) => { const r = await archive.prepare('SELECT body FROM events WHERE epoch=? AND id=?').bind(current.epoch, id).first<{ body: string }>(); return r ? parseEvent(r) : undefined; };
        const event = await find(id); if (!event) return json({ error: '이 사건을 찾을 수 없습니다.' }, 404);
        const related: WorldEvent[] = [event]; let cursor = event;
        for (let i = 0; cursor.causeId && i < 40; i++) { const parent = await find(cursor.causeId); if (!parent) break; related.push(parent); cursor = parent; }
        if (Array.isArray(event.data.evidence)) for (const id of event.data.evidence.slice(0, 40)) { const e = await find(id); if (e) related.push(e); }
        const effects = await archive.prepare(`SELECT body FROM events WHERE epoch=? AND (cause=? OR id IN (SELECT target FROM event_refs WHERE epoch=? AND source=?)) ORDER BY seq LIMIT 61`).bind(current.epoch, id, current.epoch, id).all<{ body: string }>();
        return json({ epoch: current.epoch, event, related: [...new Map([...related, ...effects.results.map(parseEvent)].map(e => [e.id, e])).values()] });
      }
      return json({ error: '지원하지 않는 요청입니다.' }, 404);
    } catch (error) {
      if (error instanceof AccessError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError) return json({ error: 'JSON 형식을 확인해 주세요.' }, 400);
      if (error instanceof Error && /관찰|저장|주민|시드|도시 정책|역사 조회|도시 의회|공동 목재|마을을 찾을|지원하지 않는 건물|부탁/.test(error.message)) return json({ error: error.message }, 400);
      console.error('World request failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: '서버 처리에 실패했습니다. 세계는 마지막 저장 상태로 유지됩니다.' }, 503);
    }
  },
};
