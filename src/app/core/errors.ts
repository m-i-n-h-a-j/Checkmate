/** An error whose message is written for players and safe to show as-is. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function messageFor(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'permission-denied':
      return "That action isn't allowed. Refresh the page and try again.";
    case 'unavailable':
    case 'auth/network-request-failed':
      return 'Connection lost. Check your network and try again.';
    case 'auth/unauthorized-domain':
      return "Sign-in isn't enabled for this domain yet.";
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return "Google sign-in isn't switched on for this project yet.";
    default:
      console.error(error);
      return 'Something went wrong. Try again.';
  }
}
