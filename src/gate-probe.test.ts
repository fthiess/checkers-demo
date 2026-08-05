import { describe, expect, it } from "vitest";
import { launchContextFor } from "./launch-context.ts";

// TEMPORARY: proves the CI gate fails a red pull request (ROADMAP 0.4). Reverted immediately.
describe("deliberate failure", () => {
  it("asserts something untrue so the gate has to catch it", () => {
    expect(launchContextFor("https:")).toBe("local-file");
  });
});
