/**
 * 결정적 난수 유틸.
 *
 * 지형 생성에 `Math.random`을 쓰면 같은 시드로 같은 맵을 다시 만들 수 없어
 * 테스트도 재현이 안 된다. 좌표와 시드만으로 값이 결정되는 해시를 쓴다.
 */

/**
 * 좌표와 시드를 0 이상 1 미만의 값으로 흩뿌린다.
 *
 * 정수 곱셈과 비트 섞기를 반복하는 방식(xorshift 계열 정수 해시)으로,
 * 인접 좌표가 서로 무관한 값을 갖게 하는 것이 목적이다. 암호학적 성질은
 * 필요하지 않다.
 *
 * @param x 첫 번째 좌표.
 * @param y 두 번째 좌표.
 * @param seed 시드. 같은 시드는 항상 같은 결과를 준다.
 * @returns 0 이상 1 미만의 값.
 */
export function hashNoise(x: number, y: number, seed: number): number {
  let h = (Math.trunc(x) * 374761393 + Math.trunc(y) * 668265263 + Math.trunc(seed) * 2147483647) | 0;

  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) | 0;

  // 부호를 없애고 32비트 범위로 정규화한다.
  return (h >>> 0) / 4294967296;
}
