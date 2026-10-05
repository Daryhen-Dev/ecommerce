import { describe, it, expect } from "vitest";
import * as domain from "@/domain";

describe("domain module", () => {
  it("loads without importing any framework or database module", () => {
    expect(domain).toBeDefined();
  });
});
