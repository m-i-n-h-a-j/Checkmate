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

export type RoomType = 'code' | 'challenge';
export type RoomStatus = 'waiting' | 'live' | 'finished' | 'cancelled' | 'declined';

/** A game room at rooms/{code}. Every live room is public to spectators. */
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
