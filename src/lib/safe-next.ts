/** Only allows same-origin relative paths as post-auth redirects. */
export function safeNext(next: string | null | undefined, fallback = "/train"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
