import { describe, expect, it } from "vitest";
import { describeLaunchContext, launchContextFor } from "./launch-context.ts";

describe("launchContextFor", () => {
  it("treats http and https as hosted", () => {
    expect(launchContextFor("http:")).toBe("hosted");
    expect(launchContextFor("https:")).toBe("hosted");
  });

  it("treats a local file as local-file", () => {
    expect(launchContextFor("file:")).toBe("local-file");
  });

  // Anything that is not plainly HTTP(S) must not be offered the R-8 shareable link, so the
  // predicate fails closed rather than guessing.
  it("fails closed on protocols it does not recognise", () => {
    expect(launchContextFor("blob:")).toBe("local-file");
    expect(launchContextFor("")).toBe("local-file");
  });
});

describe("describeLaunchContext", () => {
  it("describes both contexts as playing identically (R-52)", () => {
    expect(describeLaunchContext("hosted")).toContain("identically");
    expect(describeLaunchContext("local-file")).toContain("identically");
  });
});
