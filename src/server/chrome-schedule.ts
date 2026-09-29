import type { D1Database } from '@cloudflare/workers-types';
import { CHROME_DAILY_LIMIT, CHROME_HOURLY_LIMIT, CHROME_REST_MS } from '../llm/chrome-contract';

export async function chromeSchedule(db: D1Database, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const daily = await db.prepare('SELECT COUNT(*) AS calls FROM chrome_calls WHERE day=?').bind(day).first<{ calls: number }>();
  const recent = await db.prepare('SELECT started, COUNT(*) OVER () AS total FROM chrome_calls WHERE started>? ORDER BY started DESC LIMIT ?').bind(now - 3_600_000, CHROME_HOURLY_LIMIT).all<{ started: number; total: number }>();
  const rest = await db.prepare('SELECT next_after FROM chrome_schedule WHERE id=1').first<{ next_after: number }>();
  const legacyLock = await db.prepare('SELECT expires FROM chrome_lock WHERE id=1').first<{ expires: number }>();
  let nextAt = Math.max(now, rest?.next_after ?? 0, legacyLock ? legacyLock.expires + CHROME_REST_MS : 0), reason = nextAt > now ? 'rest' : 'ready';
  if (recent.results.length >= CHROME_HOURLY_LIMIT) {
    nextAt = Math.max(nextAt, recent.results.at(-1)!.started + 3_600_000); reason = 'hourly_limit';
  }
  if ((daily?.calls ?? 0) >= CHROME_DAILY_LIMIT) {
    nextAt = Math.max(nextAt, Date.parse(`${day}T00:00:00Z`) + 86_400_000); reason = 'daily_limit';
  }
  return { reason, nextAt, serverNow: now, hourlyCalls: recent.results[0]?.total ?? 0, hourlyLimit: CHROME_HOURLY_LIMIT, dailyCalls: daily?.calls ?? 0, dailyLimit: CHROME_DAILY_LIMIT };
}
