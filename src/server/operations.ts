import { retainedEngine } from './engine-registry';
import type { StoredWorld } from './world';
import type { D1Database } from '@cloudflare/workers-types';

// In-memory bounded samples: no extra writes on the two-second heartbeat.
const samples: { at: number; route: string; ms: number; status: number }[] = [];
export function recordRequest(route: string, ms: number, status: number, at = Date.now(), db?: D1Database) {
  if(db) accumulate(db, ms, status, at);
  samples.push({ at, route: route.replace(/\/[a-z0-9-]{16,}/gi, '/:id'), ms: Math.round(ms), status });
  while (samples.length > 256 || samples[0]?.at < at - 3_600_000) samples.shift();
}
export async function operationsStatus(db: D1Database) {
  while (samples.length && samples[0].at < Date.now() - 3_600_000) samples.shift();
  const start = performance.now();
  const probe = await db.prepare('SELECT revision FROM world WHERE id=1').all();
  const meta = probe.meta as unknown as Record<string, number>;
  const values = samples.map((s) => s.ms).sort((a, b) => a - b);
  const p95 = values.length ? values[Math.ceil(values.length * 0.95) - 1] : null;
  const bytes = Number.isFinite(meta.size_after) ? meta.size_after : null;
  const errors = samples.filter((s) => s.status >= 500).length;
  const history = await db.prepare('SELECT * FROM operation_days WHERE day>=? ORDER BY day DESC LIMIT 30').bind(new Date(Date.now()-29*86400000).toISOString().slice(0,10)).all<OperationDay>();
  const migrations = await db.prepare('SELECT * FROM engine_migrations WHERE created>=? ORDER BY created DESC LIMIT 10').bind(Date.now()-30*86400000).all<{source:string;target:string;epoch:string;ticks:number;events:number;created:number}>();
  const pending=await db.prepare('SELECT body FROM world_live WHERE revision=(SELECT revision FROM world WHERE id=1)').first<{body:string}>();
  const progress=pending?JSON.parse(pending.body):undefined;
  return {
    pendingRecovery:progress&&retainedEngine(progress.build)?{ticks:progress.ticks,available:true}:null,
    history: history.results, migrations: migrations.results,
    measuredAt: Date.now(),
    scope: 'current-worker-last-256-or-one-hour',
    samples: samples.length,
    p95Ms: p95,
    errors,
    errorRate: samples.length ? errors / samples.length : 0,
    databaseBytes: bytes,
    databaseQueryMs: meta.duration ?? null,
    probeWallMs: Math.round(performance.now() - start),
    rowsRead: meta.rows_read ?? null,
    cpuMs: null,
    memoryBytes: null,
    thresholds: { latencyMs: 2000, errorRate: 0.05, databaseBytes: 500_000_000 },
    warnings: [
      ...(p95 !== null && p95 >= 2000 ? ['서버 응답 지연: 최근 처리 시간의 95백분위가 2초 이상입니다.'] : []),
      ...(samples.length >= 10 && errors / samples.length >= 0.05 ? ['최근 서버 오류 비율이 5% 이상입니다.'] : []),
      ...(bytes !== null && bytes >= 500_000_000
        ? ['물리 DB 사용량이 500MB 이상입니다. 보관 파일과 운영 용량을 확인하세요.']
        : []),
    ],
  };
}
export type OperationsStatus = Awaited<ReturnType<typeof operationsStatus>>;

interface Counters { requests:number; errors:number; total_ms:number; max_ms:number; slow:number }
export interface OperationDay extends Counters { day:string;epoch:string;revision:number;tick:number;events:number;state_bytes:number;archive_bytes:number;measured:number }
interface Batch extends Counters { id:string;day:string }
const ledgers = new WeakMap<object,{ active:Map<string,Batch>; pending:Batch[] }>();
function ledger(db:D1Database) { let l=ledgers.get(db); if(!l){l={active:new Map(),pending:[]};ledgers.set(db,l);}return l; }
function accumulate(db:D1Database, ms:number, status:number, at:number) {
  const l=ledger(db),day=new Date(at).toISOString().slice(0,10);
  let b=l.active.get(day);if(!b){b={id:crypto.randomUUID(),day,requests:0,errors:0,total_ms:0,max_ms:0,slow:0};l.active.set(day,b);}
  const duration=Math.max(0,Math.round(ms)); b.requests++; b.errors+=status>=500?1:0;b.total_ms+=duration;b.max_ms=Math.max(b.max_ms,duration);b.slow+=duration>=2000?1:0;
  for(const key of l.active.keys()) if(key<new Date(at-30*86400000).toISOString().slice(0,10))l.active.delete(key);
}
/** Small daily aggregates join existing confirmed transactions only. CAS rollback retains the batches for retry. */
export function operationalCommit(db:D1Database,w:StoredWorld,now:number) {
  const l=ledger(db),cutoff=new Date(now-29*86400000).toISOString().slice(0,10),day=new Date(now).toISOString().slice(0,10);
  l.pending.push(...l.active.values());l.active.clear();l.pending=l.pending.filter(b=>b.day>=cutoff).slice(-256);
  const batches=[...l.pending],statements=[];
  for(const b of batches) {
    statements.push(db.prepare('INSERT OR IGNORE INTO operation_batches VALUES(?,?)').bind(b.id,b.day));
    statements.push(db.prepare(`INSERT INTO operation_days SELECT ?,?,?,?,?,?,'',0,0,0,0,0,0 WHERE changes()=1 ON CONFLICT(day) DO UPDATE SET requests=requests+excluded.requests,errors=errors+excluded.errors,total_ms=total_ms+excluded.total_ms,max_ms=max(max_ms,excluded.max_ms),slow=slow+excluded.slow`).bind(b.day,b.requests,b.errors,b.total_ms,b.max_ms,b.slow));
  }
  statements.push(db.prepare(`INSERT INTO operation_storage SELECT ?,(SELECT coalesce(max(seq),0) FROM events WHERE epoch=?),(SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM events WHERE epoch=?) WHERE NOT EXISTS(SELECT 1 FROM operation_storage WHERE epoch=?)`).bind(w.epoch,w.epoch,w.epoch,w.epoch));
  statements.push(db.prepare(`UPDATE operation_storage SET bytes=bytes+(SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM events WHERE epoch=? AND seq>operation_storage.seq),seq=(SELECT coalesce(max(seq),0) FROM events WHERE epoch=?) WHERE epoch=?`).bind(w.epoch,w.epoch,w.epoch));
  const bytes=new TextEncoder().encode(JSON.stringify(w.state)).length;
  statements.push(db.prepare(`INSERT INTO operation_days VALUES(?,0,0,0,0,0,?,?,?,?,?,(SELECT bytes FROM operation_storage WHERE epoch=?),?) ON CONFLICT(day) DO UPDATE SET epoch=excluded.epoch,revision=excluded.revision,tick=excluded.tick,events=excluded.events,state_bytes=excluded.state_bytes,archive_bytes=excluded.archive_bytes,measured=excluded.measured`).bind(day,w.epoch,w.revision,w.state.tick,w.meta.eventCount,bytes,w.epoch,now));
  statements.push(db.prepare('DELETE FROM operation_storage WHERE epoch NOT IN (?,?)').bind(w.epoch,w.meta.backupEpoch??w.epoch));
  statements.push(db.prepare('DELETE FROM operation_days WHERE day<?').bind(cutoff),db.prepare('DELETE FROM operation_batches WHERE day<?').bind(cutoff),db.prepare('DELETE FROM engine_migrations WHERE created<?').bind(now-30*86400000));
  return {statements,accepted:()=>{const ids=new Set(batches.map(b=>b.id));l.pending=l.pending.filter(b=>!ids.has(b.id));}};
}
