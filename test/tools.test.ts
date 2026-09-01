import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import {
  ToolKind,
  ToolTier,
  canDigBlock,
  digRequirementLabel,
  tierSpeedMultiplier,
  toolLabel,
} from '../src/core/tools';

describe('도구 이름', () => {
  it('등급과 종류를 함께 표시한다', () => {
    expect(toolLabel({ kind: ToolKind.PICKAXE, tier: ToolTier.MID })).toBe('중급 곡괭이');
    expect(toolLabel({ kind: ToolKind.AXE, tier: ToolTier.HIGH })).toBe('고급 도끼');
  });
});

describe('tierSpeedMultiplier', () => {
  it('등급이 오르면 속도가 빨라진다', () => {
    expect(tierSpeedMultiplier(ToolTier.BASIC)).toBe(1);
    expect(tierSpeedMultiplier(ToolTier.MID)).toBeGreaterThan(1);
    expect(tierSpeedMultiplier(ToolTier.HIGH)).toBeGreaterThan(tierSpeedMultiplier(ToolTier.MID));
  });
});

describe('canDigBlock', () => {
  it('흙은 삽으로 판다', () => {
    expect(canDigBlock({ kind: ToolKind.SHOVEL, tier: ToolTier.BASIC }, BlockType.DIRT)).toBe(true);
    expect(canDigBlock({ kind: ToolKind.PICKAXE, tier: ToolTier.HIGH }, BlockType.DIRT)).toBe(false);
  });

  it('돌은 초급 곡괭이로도 캔다', () => {
    expect(canDigBlock({ kind: ToolKind.PICKAXE, tier: ToolTier.BASIC }, BlockType.STONE)).toBe(true);
    expect(canDigBlock({ kind: ToolKind.SHOVEL, tier: ToolTier.HIGH }, BlockType.STONE)).toBe(false);
  });

  it('철광석은 중급 이상 곡괭이를 요구한다 — 기획서 5.2', () => {
    expect(canDigBlock({ kind: ToolKind.PICKAXE, tier: ToolTier.BASIC }, BlockType.IRON_ORE)).toBe(false);
    expect(canDigBlock({ kind: ToolKind.PICKAXE, tier: ToolTier.MID }, BlockType.IRON_ORE)).toBe(true);
    expect(canDigBlock({ kind: ToolKind.PICKAXE, tier: ToolTier.HIGH }, BlockType.IRON_ORE)).toBe(true);
  });

  it('빈칸은 어떤 도구로도 팔 수 없다', () => {
    expect(canDigBlock({ kind: ToolKind.SHOVEL, tier: ToolTier.HIGH }, BlockType.EMPTY)).toBe(false);
  });
});

describe('digRequirementLabel', () => {
  it('필요한 도구를 안내 문구로 알려준다', () => {
    expect(digRequirementLabel(BlockType.IRON_ORE)).toBe('중급 이상 곡괭이');
    expect(digRequirementLabel(BlockType.DIRT)).toBe('초급 이상 삽');
  });

  it('팔 수 없는 블록은 null이다', () => {
    expect(digRequirementLabel(BlockType.EMPTY)).toBeNull();
  });
});
