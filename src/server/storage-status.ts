import { WorldStore } from './store';
import { SERVER_IMPORT_BYTES } from '../sim/save-inspection';

const encoder = new TextEncoder();
export const STORAGE_NOTICE_BYTES = 100_000_000;
export const STORAGE_WARNING_BYTES = 500_000_000;
export function storageLevel(bytes: number) { return bytes >= STORAGE_WARNING_BYTES ? 'warning' : bytes >= STORAGE_NOTICE_BYTES ? 'notice' : 'normal'; }

/** Explicit owner request only. Body bytes are NOT physical DB size or provider quota. */
export async function storageStatus(store: WorldStore) {
  const started = performance.now(), current = await store.read();
  const epochs = [current.epoch, ...(current.meta.backupEpoch ? [current.meta.backupEpoch] : [])];
  const worlds = [];
  for (const epoch of epochs) {
    const state = epoch === current.epoch ? current.state : await store.checkpoint(epoch);
    const rows = await store.db.batch([
      store.db.prepare('SELECT count(*) AS count,coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes FROM events WHERE epoch=?').bind(epoch),
      store.db.prepare('SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes FROM snapshots WHERE epoch=?').bind(epoch),
      store.db.prepare('SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes FROM world_changes WHERE epoch=?').bind(epoch),
    ]);
    const events = rows[0].results[0] as { count: number; bytes: number };
    const { events: _events, ...rest } = state;
    const exportBytes = encoder.encode(JSON.stringify(rest)).length - 1 + encoder.encode(',"events":[').length + events.bytes + Math.max(0, events.count - 1) + 2;
    worlds.push({ epoch, seed: state.seed, tick: state.tick, living: state.npcs.filter(n => n.alive).length, events: events.count,
      eventBytes: events.bytes, checkpointBytes: Number((rows[1].results[0] as { bytes: number }).bytes), journalBytes: Number((rows[2].results[0] as { bytes: number }).bytes), exportBytes,
      fileImportFits: exportBytes <= SERVER_IMPORT_BYTES });
  }
  const live = await store.db.prepare('SELECT revision,body FROM world_live WHERE id=1').first<{ revision: number; body: string }>();
  const head = await store.db.prepare('SELECT revision,epoch FROM world WHERE id=1').first<{ revision: number; epoch: string }>();
  if (head?.epoch !== current.epoch || head.revision !== current.revision) throw new Error('저장 상태가 변경되었습니다. 다시 확인해 주세요.');
  const progress = live && live.revision === current.revision ? JSON.parse(live.body) : undefined;
  const bytes = worlds.reduce((n, w) => n + w.eventBytes + w.checkpointBytes + w.journalBytes, 0);
  return { measuredAt: Date.now(), queryMs: Math.round(performance.now() - started), epoch: current.epoch, revision: current.revision,
    savedAt: current.meta.savedAt ?? null, pendingTicks: progress?.epoch === current.epoch ? progress.ticks : 0,
    worlds, bodyBytes: bytes, level: storageLevel(bytes), importLimitBytes: SERVER_IMPORT_BYTES,
    thresholds: { notice: STORAGE_NOTICE_BYTES, warning: STORAGE_WARNING_BYTES } };
}
export type StorageStatus = Awaited<ReturnType<typeof storageStatus>>;
