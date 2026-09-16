import { Service, computed, effect, inject, signal } from '@angular/core';
import {
  QueryDocumentSnapshot,
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../errors';
import { FIRESTORE } from '../firebase/firebase';
import { Friend, FriendRequest, Friendship, UserProfile, snapshotOf } from '../models';
import { PresenceService } from '../presence/presence.service';
import { ProfileService, toProfile } from '../profile/profile.service';
import { pairId } from '../util/ids';

function toRequest(snap: QueryDocumentSnapshot): FriendRequest {
  return {
    ...(snap.data({ serverTimestamps: 'estimate' }) as Omit<FriendRequest, 'id'>),
    id: snap.id,
  };
}

function newestFirst(a: FriendRequest, b: FriendRequest): number {
  return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
}

@Service()
export class FriendsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfileService);
  private readonly presence = inject(PresenceService);

  private readonly incomingState = signal<FriendRequest[]>([]);
  private readonly outgoingState = signal<FriendRequest[]>([]);
  private readonly friendships = signal<Friendship[]>([]);
  private readonly friendProfiles = signal<ReadonlyMap<string, UserProfile>>(new Map());
  private readonly profileListeners = new Map<string, Unsubscribe>();

  readonly incoming = this.incomingState.asReadonly();
  readonly outgoing = this.outgoingState.asReadonly();
  readonly loaded = signal(false);

  private readonly friendUids = computed(
    () => {
      const me = this.auth.uid();
      return this.friendships()
        .map((f) => f.members.find((m) => m !== me) ?? '')
        .filter(Boolean)
        .sort();
    },
    { equal: (a, b) => a.join() === b.join() },
  );

  /** Friends with live profiles, online players first. */
  readonly friends = computed<Friend[]>(() => {
    const me = this.auth.uid();
    const profiles = this.friendProfiles();
    return this.friendships()
      .map((f) => {
        const uid = f.members.find((m) => m !== me) ?? '';
        return { friendshipId: f.id, uid, profile: profiles.get(uid) ?? null };
      })
      .sort(
        (a, b) =>
          Number(this.presence.isOnline(b.profile)) - Number(this.presence.isOnline(a.profile)) ||
          (a.profile?.displayName ?? '').localeCompare(b.profile?.displayName ?? ''),
      );
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.uid();
      this.incomingState.set([]);
      this.outgoingState.set([]);
      this.friendships.set([]);
      this.loaded.set(false);
      if (!uid) {
        return;
      }
      const requests = collection(this.db, 'friendRequests');
      const unsubscribers = [
        onSnapshot(query(requests, where('to', '==', uid)), (snap) =>
          this.incomingState.set(snap.docs.map(toRequest).sort(newestFirst)),
        ),
        onSnapshot(query(requests, where('from', '==', uid)), (snap) =>
          this.outgoingState.set(snap.docs.map(toRequest).sort(newestFirst)),
        ),
        onSnapshot(
          query(collection(this.db, 'friendships'), where('members', 'array-contains', uid)),
          (snap) => {
            this.friendships.set(
              snap.docs.map((d) => ({ ...(d.data() as Omit<Friendship, 'id'>), id: d.id })),
            );
            this.loaded.set(true);
          },
        ),
      ];
      onCleanup(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));
    });

    // Keep one live profile listener per friend so names and presence stay fresh.
    effect(() => {
      const uids = this.friendUids();
      for (const [uid, unsubscribe] of this.profileListeners) {
        if (!uids.includes(uid)) {
          unsubscribe();
          this.profileListeners.delete(uid);
          this.friendProfiles.update((map) => {
            const next = new Map(map);
            next.delete(uid);
            return next;
          });
        }
      }
      for (const uid of uids) {
        if (!this.profileListeners.has(uid)) {
          this.profileListeners.set(
            uid,
            onSnapshot(doc(this.db, 'users', uid), (snap) => {
              if (snap.exists()) {
                this.friendProfiles.update((map) => new Map(map).set(uid, toProfile(snap)));
              }
            }),
          );
        }
      }
    });
  }

  isFriend(uid: string): boolean {
    return this.friendUids().includes(uid);
  }

  /** Sends a request, or accepts right away if that player already asked you. */
  async sendRequest(lookup: string): Promise<{ result: 'sent' | 'accepted'; player: UserProfile }> {
    const me = this.profiles.profile();
    if (!me) {
      throw new AppError('Your profile is still loading. Try again in a moment.');
    }
    const player = await this.profiles.lookup(lookup);
    if (player.uid === me.uid) {
      throw new AppError("That's you. Try a friend's email or username.");
    }
    if (this.isFriend(player.uid)) {
      throw new AppError(`You and ${player.displayName} are already friends.`);
    }
    if (this.outgoing().some((r) => r.to === player.uid)) {
      throw new AppError(`You already sent ${player.displayName} a request.`);
    }
    const reverse = this.incoming().find((r) => r.from === player.uid);
    if (reverse) {
      await this.accept(reverse);
      return { result: 'accepted', player };
    }
    await setDoc(doc(this.db, 'friendRequests', `${me.uid}_${player.uid}`), {
      from: me.uid,
      to: player.uid,
      fromPlayer: snapshotOf(me),
      toPlayer: snapshotOf(player),
      createdAt: serverTimestamp(),
    });
    return { result: 'sent', player };
  }

  async accept(request: FriendRequest): Promise<void> {
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'friendships', pairId(request.from, request.to)), {
      members: [request.from, request.to],
      createdAt: serverTimestamp(),
    });
    batch.delete(doc(this.db, 'friendRequests', request.id));
    await batch.commit();
  }

  /** Declining and cancelling both just remove the request, so it can be sent again later. */
  async dismiss(request: FriendRequest): Promise<void> {
    await deleteDoc(doc(this.db, 'friendRequests', request.id));
  }

  async remove(friend: Friend): Promise<void> {
    await deleteDoc(doc(this.db, 'friendships', friend.friendshipId));
  }
}
