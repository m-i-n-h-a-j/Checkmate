export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 24;

const RESERVED = new Set([
  'admin',
  'anonymous',
  'checkmate',
  'guest',
  'moderator',
  'null',
  'official',
  'root',
  'staff',
  'support',
  'system',
  'undefined',
]);

const PIECES = ['rook', 'knight', 'bishop', 'queen', 'king', 'pawn', 'gambit', 'blitz', 'castle'];

/** Lowercases, drops a leading @ and turns spaces into underscores. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '_').toLowerCase();
}

export function usernameProblem(name: string): string | null {
  if (name.length < 3) {
    return 'Use at least 3 characters.';
  }
  if (name.length > 20) {
    return 'Keep it to 20 characters or fewer.';
  }
  if (!USERNAME_PATTERN.test(name)) {
    return 'Use lowercase letters, numbers and underscores only.';
  }
  if (RESERVED.has(name)) {
    return 'That username is reserved.';
  }
  return null;
}

export function cleanDisplayName(raw: string | null | undefined): string {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX).trim();
  return name || 'Player';
}

/** Username ideas based on a display name, e.g. "Ada Lovelace" -> ada, ada_lovelace, ada_rook. */
export function usernameIdeas(displayName: string, random: () => number = Math.random): string[] {
  const words = displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const first = (words[0] ?? 'player').slice(0, 13);
  const piece = () => PIECES[Math.floor(random() * PIECES.length)];
  const digits = () => String(Math.floor(random() * 90) + 10);

  const ideas = [
    first,
    words.join('_').slice(0, 20),
    `${first}_${piece()}`,
    `${piece()}_${first}`,
    `${first}${digits()}`,
    `${first}_${piece()}${digits()}`,
  ];
  return [...new Set(ideas)].filter((idea) => usernameProblem(idea) === null);
}
