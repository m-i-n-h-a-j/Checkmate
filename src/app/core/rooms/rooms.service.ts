import { DestroyRef, Service, Signal, computed, effect, inject, signal } from '@angular/core';
import {
  DocumentSnapshot,
  Timestamp,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../errors';
import { FIRESTORE } from '../firebase/firebase';
import { ServerClock } from '../game/server-clock.service';
import { START_FEN } from '../game/notation';
import { DEFAULT_TIME_CONTROL } from '../game/time-controls';
import { HostColor, PlayerSnapshot, Room, RoomState, TimeControl, snapshotOf } from '../models';
import { ProfileService } from '../profile/profile.service';
import { isRoomCode, pairId, roomCode } from '../util/ids';

const HOUR = 3_600_000;
const WAITING_TTL = 24 * HOUR;
const LIVE_TTL = 7 * 24 * HOUR;
const LIVE_VISIBLE_FOR = 6 * HOUR;

/** Game fields a new room starts with. Mirrors the create rule in firestore.rules. */
const NEW_GAME = {
  whiteUid: null,
  blackUid: null,
  moves: [],
  fen: START_FEN,
  whiteMs: null,
  blackMs: null,
  lastMoveAt: null,
  prevMoveAt: null,
  drawOffer: null,
  result: null,
  reason: null,
  whiteRatingDiff: null,
  blackRatingDiff: null,
  rematch: null,
  reaction: null,
} satisfies Partial<Room>;

/** Defaults for rooms created before games shipped. */
const LEGACY_DEFAULTS: Partial<Room> = {
  ...NEW_GAME,
  timeControl: DEFAULT_TIME_CONTROL,
  hostColor: 'random',
  rematchOf: null,
};

export function toRoom(snap: DocumentSnapshot): Room {
  return {
    ...LEGACY_DEFAULTS,
    ...(snap.data({ serverTimestamps: 'estimate' }) as Omit<Room, 'code'>),
    code: snap.id,
  };
}

export type RoomRole = 'host' | 'guest' | 'invited' | 'visitor';

export function roleIn(room: Room, uid: string | null): RoomRole {
  if (uid && room.hostUid === uid) return 'host';
  if (uid && room.guestUid === uid) return 'guest';
  if (uid && room.invitedUid === uid) return 'invited';
  return 'visitor';
}

function isFresh(room: Room, now: number): boolean {
  if (room.status === 'live') {
    return now - (room.startedAt?.toMillis() ?? now) < LIVE_VISIBLE_FOR;
  }
  return now - (room.createdAt?.toMillis() ?? now) < WAITING_TTL;
}

@Service()
export class RoomsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfileService);
  private readonly serverClock = inject(ServerClock);

  private readonly hostedRooms = signal<Room[]>([]);
  private readonly joinedRooms = signal<Room[]>([]);
  private readonly challengeRooms = signal<Room[]>([]);

  /** Open or live rooms the player is seated in. */
  readonly myRooms = computed(() => {
    const now = Date.now();
    return [...this.hostedRooms(), ...this.joinedRooms()].filter((room) => isFresh(room, now));
  });

  /** Friend challenges and rematch offers waiting for this player's answer. */
  readonly incomingChallenges = computed(() => {
    const now = Date.now();
    return this.challengeRooms().filter((room) => isFresh(room, now) && room.guestUid === null);
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.uid();
      this.hostedRooms.set([]);
      this.joinedRooms.set([]);
      this.challengeRooms.set([]);
      if (!uid) {
        return;
      }
      const rooms = collection(this.db, 'rooms');
      const open = where('status', 'in', ['waiting', 'live']);
      const unsubscribers = [
        onSnapshot(query(rooms, where('hostUid', '==', uid), open), (snap) =>
          this.hostedRooms.set(snap.docs.map(toRoom)),
        ),
        onSnapshot(query(rooms, where('guestUid', '==', uid), open), (snap) =>
          this.joinedRooms.set(snap.docs.map(toRoom)),
        ),
        onSnapshot(
          query(rooms, where('invitedUid', '==', uid), where('status', '==', 'waiting')),
          (snap) => this.challengeRooms.set(snap.docs.map(toRoom)),
        ),
      ];
      onCleanup(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));
    });
  }

  /** Live matches for the public arena. Must be called in an injection context. */
  liveRooms(max = 24): Signal<Room[] | null> {
    const rooms = signal<Room[] | null>(null);
    const unsubscribe = onSnapshot(
      query(
        collection(this.db, 'rooms'),
        where('status', '==', 'live'),
        orderBy('startedAt', 'desc'),
        limit(max),
      ),
      (snap) => {
        const now = Date.now();
        rooms.set(snap.docs.map(toRoom).filter((room) => isFresh(room, now)));
      },
      (error) => {
        console.error('Live rooms listener failed', error);
        rooms.set([]);
      },
    );
    inject(DestroyRef).onDestroy(unsubscribe);
    return rooms.asReadonly();
  }

  /** Follows one room by code. Must be called in an injection context. */
  room(code: () => string): Signal<RoomState> {
    const state = signal<RoomState>({ status: 'loading' });
    effect((onCleanup) => {
      const value = code().toUpperCase();
      if (!isRoomCode(value)) {
        state.set({ status: 'missing' });
        return;
      }
      state.set({ status: 'loading' });
      const unsubscribe = onSnapshot(
        doc(this.db, 'rooms', value),
        (snap) => {
          if (!snap.exists()) {
            state.set({ status: 'missing' });
            return;
          }
          const room = toRoom(snap);
          this.serverClock.observe(room, snap.metadata.hasPendingWrites);
          state.set({ status: 'ready', room });
        },
        () => state.set({ status: 'missing' }),
      );
      onCleanup(unsubscribe);
    });
    return state.asReadonly();
  }

  private me(): PlayerSnapshot {
    const profile = this.profiles.profile();
    if (!profile) {
      throw new AppError('Your profile is still loading. Try again in a moment.');
    }
    return snapshotOf(profile);
  }

  private async createRoom(
    fields: Pick<Room, 'type' | 'invitedUid' | 'invited' | 'friendshipId'>,
  ): Promise<string> {
    const me = this.me();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = roomCode();
      const ref = doc(this.db, 'rooms', code);
      const created = await runTransaction(this.db, async (tx) => {
        if ((await tx.get(ref)).exists()) {
          return false;
        }
        tx.set(ref, {
          code,
          ...fields,
          ...NEW_GAME,
          status: 'waiting',
          hostUid: me.uid,
          host: me,
          guestUid: null,
          guest: null,
          hostReady: false,
          guestReady: false,
          createdAt: serverTimestamp(),
          startedAt: null,
          endedAt: null,
          endedBy: null,
          expiresAt: Timestamp.fromMillis(Date.now() + WAITING_TTL),
          timeControl: DEFAULT_TIME_CONTROL,
          hostColor: 'random',
          rematchOf: null,
        });
        return true;
      });
      if (created) {
        return code;
      }
    }
    throw new AppError("Couldn't find a free room code. Try again.");
  }

  createCodeRoom(): Promise<string> {
    return this.createRoom({ type: 'code', invitedUid: null, invited: null, friendshipId: null });
  }

  /** Challenges a friend. Reuses an open challenge to the same friend instead of stacking new ones. */
  challenge(friend: PlayerSnapshot): Promise<string> {
    const existing = this.hostedRooms().find(
      (room) =>
        room.type === 'challenge' && room.status === 'waiting' && room.invitedUid === friend.uid,
    );
    if (existing) {
      return Promise.resolve(existing.code);
    }
    const me = this.me();
    return this.createRoom({
      type: 'challenge',
      invitedUid: friend.uid,
      invited: snapshotOf(friend),
      friendshipId: pairId(me.uid, friend.uid),
    });
  }

  async join(rawCode: string): Promise<string> {
    const code = rawCode.trim().toUpperCase();
    if (!isRoomCode(code)) {
      throw new AppError('Room codes are 6 letters and numbers.');
    }
    const me = this.me();
    const ref = doc(this.db, 'rooms', code);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new AppError(`No room with code ${code}. Check the code and try again.`);
      }
      const room = toRoom(snap);
      if (room.hostUid === me.uid || room.guestUid === me.uid) {
        return;
      }
      if (room.status === 'live') {
        throw new AppError('That match already started. You can still watch it live.');
      }
      if (room.status !== 'waiting') {
        throw new AppError('That room is closed.');
      }
      if (room.guestUid) {
        throw new AppError('Both seats in that room are taken.');
      }
      if (room.type !== 'code' && room.invitedUid !== me.uid) {
        throw new AppError(`That room is ${room.host.displayName}'s challenge for someone else.`);
      }
      tx.update(ref, { guestUid: me.uid, guest: me });
    });
    return code;
  }

  /** Host sets the clock and their color. Both players have to ready up again. */
  async updateSettings(
    room: Room,
    settings: { timeControl: TimeControl; hostColor: HostColor },
  ): Promise<void> {
    await updateDoc(doc(this.db, 'rooms', room.code), {
      timeControl: settings.timeControl,
      hostColor: settings.hostColor,
      hostReady: false,
      guestReady: false,
    });
  }

  /**
   * Marks this player ready. When both are ready the match goes live for everyone to watch: colors
   * are dealt and both clocks are set.
   */
  async setReady(code: string, ready: boolean): Promise<void> {
    const uid = this.auth.uid();
    const ref = doc(this.db, 'rooms', code);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        return;
      }
      const room = toRoom(snap);
      const role = roleIn(room, uid);
      if ((role !== 'host' && role !== 'guest') || room.status !== 'waiting' || !room.guestUid) {
        return;
      }
      const key = role === 'host' ? 'hostReady' : 'guestReady';
      const opponentReady = role === 'host' ? room.guestReady : room.hostReady;
      if (ready && opponentReady) {
        const hostWhite =
          room.hostColor === 'random' ? Math.random() < 0.5 : room.hostColor === 'white';
        const clock = room.timeControl.initial * 1000;
        tx.update(ref, {
          [key]: true,
          status: 'live',
          startedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + LIVE_TTL),
          whiteUid: hostWhite ? room.hostUid : room.guestUid,
          blackUid: hostWhite ? room.guestUid : room.hostUid,
          whiteMs: clock,
          blackMs: clock,
        });
      } else {
        tx.update(ref, { [key]: ready });
      }
    });
  }

  /** Host closes a waiting room, or a guest gives up their seat. Live games end by resigning or aborting. */
  async leave(room: Room): Promise<void> {
    const uid = this.auth.uid();
    const role = roleIn(room, uid);
    const ref = doc(this.db, 'rooms', room.code);
    if (room.status === 'waiting' && role === 'host') {
      await updateDoc(ref, { status: 'cancelled', endedAt: serverTimestamp(), endedBy: uid });
    } else if (room.status === 'waiting' && role === 'guest') {
      await updateDoc(ref, { guestUid: null, guest: null, guestReady: false, hostReady: false });
    }
  }

  async decline(room: Room): Promise<void> {
    await updateDoc(doc(this.db, 'rooms', room.code), {
      status: 'declined',
      endedAt: serverTimestamp(),
      endedBy: this.auth.uid(),
    });
  }

  /**
   * Offers a rematch after a finished game: a new room with the same clock and colors swapped,
   * where this player is already ready. Returns the new room's code, or the one the opponent
   * already opened.
   */
  async offerRematch(finished: Room): Promise<string> {
    const me = this.me();
    const opponent = finished.hostUid === me.uid ? finished.guest : finished.host;
    if (!opponent || finished.status !== 'finished') {
      throw new AppError('A rematch needs a finished game with two players.');
    }
    const oldRef = doc(this.db, 'rooms', finished.code);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = roomCode();
      const ref = doc(this.db, 'rooms', code);
      const result = await runTransaction(this.db, async (tx) => {
        const current = toRoom(await tx.get(oldRef));
        if (current.rematch) {
          return current.rematch;
        }
        if ((await tx.get(ref)).exists()) {
          return null;
        }
        const wasWhite = current.whiteUid === me.uid;
        tx.set(ref, {
          code,
          type: 'rematch',
          ...NEW_GAME,
          status: 'waiting',
          hostUid: me.uid,
          host: me,
          guestUid: null,
          guest: null,
          invitedUid: opponent.uid,
          invited: snapshotOf(opponent),
          friendshipId: null,
          hostReady: true,
          guestReady: false,
          createdAt: serverTimestamp(),
          startedAt: null,
          endedAt: null,
          endedBy: null,
          expiresAt: Timestamp.fromMillis(Date.now() + WAITING_TTL),
          timeControl: current.timeControl,
          hostColor: current.whiteUid ? (wasWhite ? 'black' : 'white') : 'random',
          rematchOf: current.code,
        });
        tx.update(oldRef, { rematch: code });
        return code;
      });
      if (result) {
        return result;
      }
    }
    throw new AppError("Couldn't find a free room code. Try again.");
  }
}
