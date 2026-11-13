import { describe, expect, it } from "vitest";
import { signatureBounds } from "./signature";

describe("서명 투명 여백 정리", () => {
  it("빈 서명을 만들지 않는다", () => {
    expect(
      signatureBounds({ width: 600, height: 180, data: new Uint8ClampedArray(600 * 180 * 4) }),
    ).toBeNull();
  });
  it("가느다란 가장자리까지 보존하고 캔버스 밖으로 자르지 않는다", () => {
    const data = new Uint8ClampedArray(600 * 180 * 4);
    data[(10 * 600 + 0) * 4 + 3] = 1;
    data[(179 * 600 + 100) * 4 + 3] = 255;
    expect(signatureBounds({ width: 600, height: 180, data })).toEqual({
      x: 0,
      y: 4,
      width: 107,
      height: 176,
    });
  });
});
