import type { D1Database } from '@cloudflare/workers-types';

// In-memory bounded samples: no extra writes on the two-second heartbeat.
const samples: { at: number; route: string; ms: number; status: number }[] = [];
export function recordRequest(route: string, ms: number, status: number, at = Date.now()) {
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
  return {
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
