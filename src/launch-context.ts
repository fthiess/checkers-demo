/**
 * Where the application is running from.
 *
 * The two distribution forms are functionally identical (R-52) with one exception: the
 * shareable-link convenience of R-8 is only meaningful when the page was served over
 * HTTP(S), because a `file://` page has no address anyone else can open. Phase 1 uses this
 * to decide whether to offer the link; for now it is what the placeholder reports.
 */
export type LaunchContext = "hosted" | "local-file";

export function launchContextFor(protocol: string): LaunchContext {
  return protocol === "http:" || protocol === "https:" ? "hosted" : "local-file";
}

export function describeLaunchContext(context: LaunchContext): string {
  return context === "hosted"
    ? "Running from the web. Both distribution forms play identically."
    : "Running from a local file. Both distribution forms play identically.";
}
