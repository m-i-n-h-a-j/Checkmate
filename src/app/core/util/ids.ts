/** Room code alphabet without look-alike characters (0/O, 1/I). 32 symbols, so byte % 32 is unbiased. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function roomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

export function isRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}

/** Keeps only characters that can appear in a room code, uppercased. */
export function sanitizeRoomCode(value: string): string {
  return value
    .toUpperCase()
    .split('')
    .filter((char) => ROOM_CODE_ALPHABET.includes(char))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/** Order-independent id for a pair of players, e.g. a friendship. Mirrors pairId() in firestore.rules. */
export function pairId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}
