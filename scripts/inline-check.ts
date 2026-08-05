/**
 * Checks that the single-file build really is a single file.
 *
 * R-1 is the requirement the whole deliverable rests on: opening the file from `file://`
 * launches a fully functional application. That only holds if nothing in the document
 * reaches for a resource that is not inside it. R-54 adds a working budget of one megabyte
 * so the file can be sent as an email attachment.
 *
 * Pure functions here; `check-single-file.ts` is the command that reads the build and
 * reports.
 */

export const SIZE_BUDGET_BYTES = 1_000_000;

export interface ExternalReference {
  /** The attribute that carries the reference, e.g. `script src`. */
  readonly kind: string;
  /** The offending URL exactly as it appears in the document. */
  readonly url: string;
}

/** Attributes that cause a browser to fetch something while loading the document. */
const SUBRESOURCE_ATTRIBUTES: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: "script src", pattern: /<script\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi },
  { kind: "link href", pattern: /<link\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)')/gi },
  { kind: "img src", pattern: /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi },
  {
    kind: "image srcset",
    pattern: /<(?:img|source)\b[^>]*?\ssrcset\s*=\s*("([^"]*)"|'([^']*)')/gi,
  },
  {
    kind: "media src",
    pattern: /<(?:audio|video|source|track)\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi,
  },
  { kind: "iframe src", pattern: /<iframe\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi },
  { kind: "css url()", pattern: /url\(\s*("([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi },
  { kind: "css @import", pattern: /@import\s+("([^"]*)"|'([^']*)')/gi },
];

/**
 * A reference is self-contained when the browser can resolve it without a network or
 * filesystem fetch: inline data, a same-document fragment, or nothing at all.
 */
function isSelfContained(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === "") return true;
  if (trimmed.startsWith("#")) return true;
  if (trimmed.startsWith("data:")) return true;
  if (trimmed.startsWith("blob:")) return true;
  return false;
}

/** Extracts whichever capture group actually matched the quoted or bare value. */
function matchedValue(match: RegExpExecArray): string {
  return match[2] ?? match[3] ?? match[4] ?? "";
}

/**
 * Finds every reference in the document that a browser would have to fetch from outside it.
 *
 * Anchor `href`s are deliberately not checked — a link to the project page is a link the
 * player chooses to follow, not a resource the document needs in order to work.
 */
export function findExternalReferences(html: string): ExternalReference[] {
  const found: ExternalReference[] = [];

  for (const { kind, pattern } of SUBRESOURCE_ATTRIBUTES) {
    // Each pattern is global and reused across calls, so reset before scanning.
    pattern.lastIndex = 0;
    let match = pattern.exec(html);
    while (match !== null) {
      const url = matchedValue(match);
      if (!isSelfContained(url)) found.push({ kind, url });
      match = pattern.exec(html);
    }
  }

  return found;
}

export interface SingleFileReport {
  readonly sizeBytes: number;
  readonly withinBudget: boolean;
  readonly externalReferences: readonly ExternalReference[];
  readonly ok: boolean;
}

export function inspectSingleFile(html: string, sizeBytes: number): SingleFileReport {
  const externalReferences = findExternalReferences(html);
  const withinBudget = sizeBytes <= SIZE_BUDGET_BYTES;
  return {
    sizeBytes,
    withinBudget,
    externalReferences,
    ok: withinBudget && externalReferences.length === 0,
  };
}

export function formatSize(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

export function formatReport(report: SingleFileReport): string {
  const lines: string[] = [];
  const budget = formatSize(SIZE_BUDGET_BYTES);
  const size = formatSize(report.sizeBytes);
  const share = ((report.sizeBytes / SIZE_BUDGET_BYTES) * 100).toFixed(1);

  lines.push(
    report.withinBudget
      ? `Size ${size} — ${share}% of the ${budget} budget (R-54).`
      : `Size ${size} — OVER the ${budget} budget (R-54).`,
  );

  if (report.externalReferences.length === 0) {
    lines.push("No external references: the document is self-contained (R-1).");
  } else {
    lines.push(`${report.externalReferences.length} external reference(s) survived (R-1):`);
    for (const reference of report.externalReferences) {
      lines.push(`  ${reference.kind}: ${reference.url}`);
    }
  }

  return lines.join("\n");
}
