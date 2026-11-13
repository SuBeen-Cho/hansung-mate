import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { archiveDocument, clearDocuments, readDocument } from "./documents";

beforeAll(() =>
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }),
);
describe("제출 PDF 버전", () => {
  it("원본 바이트를 보존하고 같은 버전 덮어쓰기를 막는다", async () => {
    const first = await archiveDocument("revision-proof:r1", new Uint8Array([1, 2, 3]));
    expect(first.storage).toBe("DEVICE");
    await expect(archiveDocument("revision-proof:r1", new Uint8Array([9]))).rejects.toThrow(
      "덮어쓸 수 없어요",
    );
    await archiveDocument("revision-proof:r2", new Uint8Array([4, 5, 6]));
    expect(Array.from((await readDocument("revision-proof:r1"))?.bytes ?? [])).toEqual([1, 2, 3]);
    expect((await readDocument("revision-proof:r2"))?.sha256).not.toBe(first.document.sha256);
  });
});

it("명시적인 전체 삭제는 보관 PDF도 제거한다", async () => {
  await archiveDocument("reset-proof:r1", new Uint8Array([7]));
  await clearDocuments();
  expect(await readDocument("reset-proof:r1")).toBeNull();
});
