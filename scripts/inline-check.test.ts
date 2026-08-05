import { describe, expect, it } from "vitest";
import {
  findExternalReferences,
  formatReport,
  inspectSingleFile,
  SIZE_BUDGET_BYTES,
} from "./inline-check.ts";

describe("findExternalReferences", () => {
  it("accepts a document that carries everything inline", () => {
    const html = `<!doctype html><html><head>
      <style>body { background: url("data:image/png;base64,AAAA"); }</style>
      </head><body><script type="module">console.log(1);</script></body></html>`;
    expect(findExternalReferences(html)).toEqual([]);
  });

  it("catches a script that was not inlined", () => {
    const html = `<script type="module" src="/assets/index-abc123.js"></script>`;
    expect(findExternalReferences(html)).toEqual([
      { kind: "script src", url: "/assets/index-abc123.js" },
    ]);
  });

  it("catches a stylesheet that was not inlined", () => {
    const html = `<link rel="stylesheet" href="./assets/index.css">`;
    expect(findExternalReferences(html)).toEqual([
      { kind: "link href", url: "./assets/index.css" },
    ]);
  });

  it("catches a remote font pulled in from CSS", () => {
    const html = `<style>@import "https://fonts.example/face.css";</style>`;
    expect(findExternalReferences(html)).toEqual([
      { kind: "css @import", url: "https://fonts.example/face.css" },
    ]);
  });

  it("catches an unquoted url() in CSS", () => {
    const html = `<style>body { background: url(./board.png); }</style>`;
    expect(findExternalReferences(html)).toEqual([{ kind: "css url()", url: "./board.png" }]);
  });

  it("catches images and media", () => {
    const html = `<img src="crown.svg"><audio src="click.mp3"></audio>`;
    expect(findExternalReferences(html)).toEqual([
      { kind: "img src", url: "crown.svg" },
      { kind: "media src", url: "click.mp3" },
    ]);
  });

  it("ignores anchors, which are the player's choice to follow rather than a subresource", () => {
    const html = `<a href="https://github.com/fthiess/checkers-demo">How this is built</a>`;
    expect(findExternalReferences(html)).toEqual([]);
  });

  it("ignores same-document fragments and empty values", () => {
    const html = `<link rel="icon" href="#none"><img src="">`;
    expect(findExternalReferences(html)).toEqual([]);
  });

  it("handles single-quoted attributes", () => {
    const html = `<script src='/assets/index.js'></script>`;
    expect(findExternalReferences(html)).toEqual([{ kind: "script src", url: "/assets/index.js" }]);
  });

  // The patterns are module-level and global, so a stale lastIndex would make the second
  // call miss what the first one found.
  it("gives the same answer when called twice", () => {
    const html = `<script src="/assets/index.js"></script>`;
    expect(findExternalReferences(html)).toEqual(findExternalReferences(html));
  });
});

describe("inspectSingleFile", () => {
  const clean = "<!doctype html><html><body>hello</body></html>";

  it("passes a clean document inside the budget", () => {
    const report = inspectSingleFile(clean, 50_000);
    expect(report.ok).toBe(true);
    expect(report.withinBudget).toBe(true);
  });

  it("fails a document that is over the R-54 budget", () => {
    const report = inspectSingleFile(clean, SIZE_BUDGET_BYTES + 1);
    expect(report.withinBudget).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("accepts a document exactly at the budget", () => {
    expect(inspectSingleFile(clean, SIZE_BUDGET_BYTES).withinBudget).toBe(true);
  });

  it("fails a document that still reaches outside itself", () => {
    const report = inspectSingleFile(`${clean}<script src="/a.js"></script>`, 1000);
    expect(report.ok).toBe(false);
    expect(report.externalReferences).toHaveLength(1);
  });
});

describe("formatReport", () => {
  it("names the offending reference so the failure is actionable", () => {
    const report = inspectSingleFile(`<script src="/assets/index.js"></script>`, 1000);
    expect(formatReport(report)).toContain("/assets/index.js");
  });

  it("says plainly when the document is self-contained", () => {
    const report = inspectSingleFile("<p>hi</p>", 1000);
    expect(formatReport(report)).toContain("self-contained");
  });
});
