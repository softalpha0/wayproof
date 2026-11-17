import { describe, expect, it } from "vitest";

describe("engine package", () => {
  // The first import of the whole engine can take a long time on a busy Windows machine (5 s default
  // timed out on 17 Nov; 31.6 s once later that day with Chrome still running). This test checks that
  // it loads, not how fast.
  it("loads", async () => {
    const engine = await import("../src/index.ts");
    expect(engine).toBeTypeOf("object");
  }, 120_000);
});
