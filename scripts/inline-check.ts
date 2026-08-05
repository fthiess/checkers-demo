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

/**
 * Attributes that cause a browser to fetch something while loading the document.
 *
 * `candidateList` marks an attribute whose value is a comma-separated list of candidates
 * with optional descriptors (`srcset`). Checking such a value as one string lets a leading
 * `data:` URI vouch for every candidate behind it, so the list is split before checking.
 *
 * `link href` is checked whatever the `rel` — a `rel` that does not fetch would be a false
 * positive, but this check exists to fail loudly rather than to ship a broken file quietly.
 */
const SUBRESOURCE_ATTRIBUTES: ReadonlyArray<{
  kind: string;
  pattern: RegExp;
  candidateList?: boolean;
}> = [
  { kind: "script src", pattern: /<script\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi },
  { kind: "link href", pattern: /<link\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)')/gi },
  { kind: "img src", pattern: /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi },
  {
    kind: "image srcset",
    pattern: /<(?:img|source)\b[^>]*?\ssrcset\s*=\s*("([^"]*)"|'([^']*)')/gi,
    candidateList: true,
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
 * Splits a `srcset` value into its candidate URLs, dropping the width and density
 * descriptors.
 *
 * Splitting on commas does not work: a `data:` URI contains commas of its own. This follows
 * the HTML parsing rule instead — a candidate's URL runs to the next whitespace, a trailing
 * comma on the URL ends the candidate outright, and otherwise the descriptors that follow
 * are skipped up to the next comma.
 */
function srcsetCandidates(value: string): string[] {
  const candidates: string[] = [];
  const isWhitespace = (index: number): boolean => /\s/.test(value.charAt(index));
  let i = 0;

  while (i < value.length) {
    while (i < value.length && (isWhitespace(i) || value.charAt(i) === ",")) i++;
    if (i >= value.length) break;

    const start = i;
    while (i < value.length && !isWhitespace(i)) i++;
    const token = value.slice(start, i);
    const url = token.replace(/,+$/, "");
    if (url !== "") candidates.push(url);

    // A URL that ended in a comma ended its candidate; otherwise descriptors follow.
    if (token === url) {
      while (i < value.length && value.charAt(i) !== ",") i++;
    }
  }

  return candidates;
}

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
  // The whole document is scanned, and that includes the inlined bundle. A `url()` built
  // from a template literal at runtime is script, not a reference the browser resolves at
  // load, so it is not something this check can or should judge.
  if (trimmed.includes("${")) return true;
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

  for (const { kind, pattern, candidateList } of SUBRESOURCE_ATTRIBUTES) {
    // Each pattern is global and reused across calls, so reset before scanning.
    pattern.lastIndex = 0;
    let match = pattern.exec(html);
    while (match !== null) {
      const value = matchedValue(match);
      const urls = candidateList === true ? srcsetCandidates(value) : [value];
      for (const url of urls) {
        if (!isSelfContained(url)) found.push({ kind, url });
      }
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
