/**
 * Reports on the single-file build and fails the gate if it is not one file (R-1) or has
 * outgrown the attachment budget (R-54).
 *
 * Usage: node scripts/check-single-file.ts [path]
 */

import { readFile, stat } from "node:fs/promises";
import { argv, exit, stderr, stdout } from "node:process";
import { formatReport, inspectSingleFile } from "./inline-check.ts";

const DEFAULT_PATH = "dist-single/checkers.html";

async function main(): Promise<number> {
  const path = argv[2] ?? DEFAULT_PATH;

  let html: string;
  let sizeBytes: number;
  try {
    [html, sizeBytes] = await Promise.all([
      readFile(path, "utf8"),
      stat(path).then((info) => info.size),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    stderr.write(`Cannot read ${path}: ${reason}\nRun \`npm run build:single\` first.\n`);
    return 1;
  }

  const report = inspectSingleFile(html, sizeBytes);
  stdout.write(`${path}\n${formatReport(report)}\n`);
  return report.ok ? 0 : 1;
}

exit(await main());
