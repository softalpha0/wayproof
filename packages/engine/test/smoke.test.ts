import { describe, expect, it } from "vitest";

describe("engine package", () => {
  // The first import of the whole engine can take several seconds on Windows (it timed out at the
  // 5-second default once, 17 Nov). This test checks that it loads, not how fast.
  it("loads", async () => {
    const engine = await import("../src/index.ts");
    expect(engine).toBeTypeOf("object");
  }, 30_000);
});
