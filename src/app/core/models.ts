import { Timestamp } from 'firebase/firestore';

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  rating: number;
}

/** Public player profile stored at users/{uid}. Readable by anyone. */
export interface UserProfile {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  onboardingSeen: boolean;
  stats: PlayerStats;
  createdAt: Timestamp | null;
  lastActive: Timestamp | null;
  /** Code of the last rated game that changed these stats. */
  lastGame?: string;
}

/** Denormalized copy of a player embedded in requests and rooms. */
export interface PlayerSnapshot {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
}

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  fromPlayer: PlayerSnapshot;
  toPlayer: PlayerSnapshot;
  createdAt: Timestamp | null;
}

export interface Friendship {
  id: string;
  members: string[];
  createdAt: Timestamp | null;
}

export interface Friend {
  friendshipId: string;
  uid: string;
  profile: UserProfile | null;
}

export type Side = 'white' | 'black';
export type HostColor = Side | 'random';

/** Clock settings in seconds, e.g. 3 minutes plus 2 seconds per move. */
export interface TimeControl {
  initial: number;
  increment: number;
}

export type GameResult = Side | 'draw' | 'aborted';
export type GameEndReason =
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'stalemate'
  | 'insufficient'
  | 'threefold'
  | 'fifty'
  | 'agreement'
  | 'aborted';

/** The last reaction either player sent, kept on the room so it reaches spectators too. */
export interface Reaction {
  uid: string;
  emoji: string;
  at: Timestamp;
  /** Counts up with every reaction, so repeats of the same emoji are still new. */
  n: number;
}

export type RoomType = 'code' | 'challenge' | 'rematch';
export type RoomStatus = 'waiting' | 'live' | 'finished' | 'cancelled' | 'declined';

/**
 * A game room at rooms/{code}. Every live room is public to spectators.
 *
 * The chess game lives in the same document so a move, the clocks and the result change together.
 * Clocks only ever use server timestamps: `whiteMs`/`blackMs` hold each side's time left as of that
 * side's previous move, and the opponent settles the latest think time on their next move.
 */
export interface Room {
  code: string;
  type: RoomType;
  status: RoomStatus;
  hostUid: string;
  host: PlayerSnapshot;
  guestUid: string | null;
  guest: PlayerSnapshot | null;
  invitedUid: string | null;
  invited: PlayerSnapshot | null;
  friendshipId: string | null;
  hostReady: boolean;
  guestReady: boolean;
  createdAt: Timestamp | null;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  endedBy: string | null;
  expiresAt: Timestamp;

  timeControl: TimeControl;
  hostColor: HostColor;
  whiteUid: string | null;
  blackUid: string | null;
  /** Moves in UCI notation, e.g. "e2e4" or "e7e8q". */
  moves: string[];
  fen: string;
  whiteMs: number | null;
  blackMs: number | null;
  lastMoveAt: Timestamp | null;
  prevMoveAt: Timestamp | null;
  /** uid of the player offering a draw. */
  drawOffer: string | null;
  result: GameResult | null;
  reason: GameEndReason | null;
  whiteRatingDiff: number | null;
  blackRatingDiff: number | null;
  /** The finished room this rematch follows. */
  rematchOf: string | null;
  /** Code of the rematch room created after this game. */
  rematch: string | null;
  /** The last reaction either player sent, if any. */
  reaction: Reaction | null;
}

export type RoomState =
  { status: 'loading' } | { status: 'missing' } | { status: 'ready'; room: Room };

export function snapshotOf(profile: PlayerSnapshot): PlayerSnapshot {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    username: profile.username,
    photoURL: profile.photoURL,
  };
}
