/// <reference types="vitest/config" />
import { rename } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Renames the emitted HTML document. The single-file build is a deliverable people save and
 * email (R-1, R-54), so it wants a name that means something on a desktop — `index.html`
 * does not.
 *
 * The rename happens on disk in `writeBundle` rather than by re-keying the bundle in
 * `generateBundle`: Rolldown, which Vite 8 bundles with, ignores assignments to the bundle
 * map, and an ignored assignment silently produced no HTML at all.
 */
function renameHtmlOutput(to: string): Plugin {
  return {
    name: "checkers:rename-html-output",
    enforce: "post",
    async writeBundle(options, bundle) {
      const dir = options.dir;
      if (dir === undefined) return;

      const documents = Object.keys(bundle).filter((name) => name.endsWith(".html"));
      // Renaming several documents to one name would silently leave only the last. If a
      // second HTML entry is ever added, this has to become a mapping rather than a name.
      if (documents.length > 1) {
        throw new Error(
          `Expected one HTML document to rename to ${to}, found ${documents.length}: ${documents.join(", ")}`,
        );
      }

      const document = documents[0];
      if (document === undefined || document === to) return;
      await rename(join(dir, document), join(dir, to));
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === "single";

  return {
    // Relative asset URLs so the hosted build works from a project subpath on GitHub Pages
    // and the single-file build works from `file://` (R-52).
    base: "./",
    plugins: single ? [viteSingleFile(), renameHtmlOutput("checkers.html")] : [],
    build: {
      target: "es2022",
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      // Inline everything for the single-file target; the check script proves nothing escaped.
      ...(single ? { assetsInlineLimit: Number.POSITIVE_INFINITY, cssCodeSplit: false } : {}),
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    },
  };
});
