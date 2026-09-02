import type { ActionFailure } from '../sim/Game';
import type { PlacementFailure } from '../sim/Buildings';

/**
 * 행동이 거절된 이유를 사람이 읽는 문구로 바꾼다.
 *
 * 기획서 7절이 대사창을 배제하고 "짧은 토스트 알림"만 허용하므로, 거절 사유는
 * 한 줄로 끝나야 한다. 사유를 값으로 돌려주도록 `Game`을 만들어 둔 덕분에
 * 규칙과 문구가 분리돼 있다.
 *
 * @param reason 거절 사유.
 * @param placement 배치 실패의 구체적 사유. 건축에서만 온다.
 * @returns 안내 문구. 알릴 필요가 없는 사유면 null.
 */
export function describeFailure(reason: ActionFailure, placement?: PlacementFailure): string | null {
  switch (reason) {
    case 'busy':
      // 연타 중에 흔히 나오는 상태다. 알리면 시끄럽기만 하다.
      return null;
    case 'notAdjacent':
      return '너무 멉니다 — 옆 칸까지 다가가세요';
    case 'empty':
      return '여기에는 팔 것이 없습니다';
    case 'wrongTool':
      return '도구가 맞지 않습니다 (1~3으로 교체)';
    case 'noMaterial':
      return '자재가 부족합니다';
    case 'inventoryFull':
      return '인벤토리가 가득 찼습니다 (E로 창고에 예치)';
    case 'zoneLocked':
      return '아직 열리지 않은 구역입니다';
    case 'notVillage':
      return '마을에서만 할 수 있습니다 — 지상으로 나가세요';
    case 'notPortal':
      return '통로 위에 서서 F를 누르세요';
    case 'blocked':
      return '여기에는 놓을 수 없습니다';
    case 'noBlueprint':
      return '지을 것을 먼저 고르세요';
    case 'badPlacement':
      return describePlacement(placement);
    case 'noBuilding':
      return '철거할 건물이 없습니다';
    case 'lastStorage':
      return '마지막 창고는 철거할 수 없습니다';
    default:
      return null;
  }
}

/**
 * 배치 실패 사유를 문구로 바꾼다.
 *
 * @param placement 배치 실패 사유.
 * @returns 안내 문구.
 */
function describePlacement(placement?: PlacementFailure): string {
  switch (placement) {
    case 'notFlat':
      return '평탄한 땅이 아닙니다 — 파거나 쌓아 고르세요';
    case 'nodeInWay':
      return '나무나 광맥이 자리를 막고 있습니다';
    case 'overlaps':
      return '다른 건물과 겹칩니다';
    case 'outOfBounds':
      return '맵을 벗어납니다';
    default:
      return '여기에는 지을 수 없습니다';
  }
}
