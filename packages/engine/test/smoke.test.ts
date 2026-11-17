import { describe, expect, it } from "vitest";

describe("engine package", () => {
  it("loads", async () => {
    const engine = await import("../src/index.ts");
    expect(engine).toBeTypeOf("object");
  });
});
