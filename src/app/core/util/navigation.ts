/** Only follow in-app paths from query params, never another origin. */
export function safeNext(next: string | null | undefined, fallback = '/play'): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/setup')
    ? next
    : fallback;
}
