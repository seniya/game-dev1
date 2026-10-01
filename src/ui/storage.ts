import type { StorageStatus } from '../server/storage-status';
import type { inspectSave } from '../sim/save-inspection';
const number = (n: number) => n.toLocaleString('ko-KR');
export const sizeLabel = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;
export function storageView(s: StorageStatus) {
  return `<h3>저장 상태</h3><p>${s.savedAt ? `마지막 확정 ${new Date(s.savedAt).toLocaleString('ko-KR')}` : '초기 세계'} · 저장 대기 ${number(s.pendingTicks)}틱</p>
    <p>${s.worlds.map((w, i) => `${i ? '직전 백업' : '현재 세계'}: ${Math.floor(w.tick / 144) + 1}일째 · 생존 ${number(w.living)}명 · 사건 ${number(w.events)}건<br>전체 파일 ${sizeLabel(w.exportBytes)} · ${w.fileImportFits ? '10MB 파일 가져오기 범위 안' : w.exportBytes <= 24_000_000 ? '24MB 분할 가져오기 지원' : '24MB 파일 가져오기 범위 초과'}`).join('</p><p>')}</p>
    <p>보관 본문 ${sizeLabel(s.bodyBytes)}${s.level === 'warning' ? ' · 저장량 경고: 운영 용량을 확인하고 별도 파일을 보관해 주세요.' : s.level === 'notice' ? ' · 저장량 주의: 운영 용량을 확인해 주세요.' : ''}</p>
    <p class="muted">현재·직전 백업의 확정 상태와 사건 JSON 본문 합계입니다. 색인·운영 기록·여유 공간을 포함한 DB 전체 사용량이나 요금은 아닙니다. 100MB부터 주의, 500MB부터 경고합니다. 기록을 자동 삭제하지 않습니다.</p>
    <p class="muted">서버 직전 백업 복원에는 파일 10MB 한도를 적용하지 않습니다. 파일을 따로 보관하려면 ‘세계 저장’을 사용하세요. 일반 진행은 최대 5분 간격으로 확정됩니다.</p>
    <p class="muted">${new Date(s.measuredAt).toLocaleTimeString('ko-KR')} 측정 · 조회 ${s.queryMs}ms (CPU 사용량 아님)</p>`;
}
export function importPreview(s: ReturnType<typeof inspectSave>) {
  return `<div class="eyebrow">RESTORE A WORLD</div><h2>가져올 세계 확인</h2><p>시드 ${s.seed} · ${Math.floor(s.tick / 144) + 1}일째<br>생존 주민 ${number(s.living)}명 / 인물 기록 ${number(s.people)}명<br>사건 ${number(s.events)}건 · ${sizeLabel(s.bytes)}</p><p>저장 형식과 참조를 확인했습니다. 적용하면 현재 세계는 직전 백업이 되고, 가져온 세계는 일시정지 상태로 열립니다. AI는 Mock 또는 끄기로 시작합니다.</p><button id="apply-import" class="button primary">이 세계로 교체</button><p class="muted">닫으면 적용하지 않습니다.</p>`;
}
