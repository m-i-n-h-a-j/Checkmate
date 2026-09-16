import { Service, effect, inject, signal } from '@angular/core';
import { User } from 'firebase/auth';
import {
  DocumentSnapshot,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../errors';
import { FIRESTORE } from '../firebase/firebase';
import { UserProfile } from '../models';
import { cleanDisplayName, normalizeUsername, usernameProblem } from '../util/username';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UID_PATTERN = /^[A-Za-z0-9]{28}$/;

export function toProfile(snap: DocumentSnapshot): UserProfile {
  return {
    ...(snap.data({ serverTimestamps: 'estimate' }) as Omit<UserProfile, 'uid'>),
    uid: snap.id,
  };
}

@Service()
export class ProfileService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly profileState = signal<UserProfile | null>(null);
  private readonly indexedEmails = new Set<string>();

  /** The signed-in player's profile, or null while signed out or loading. */
  readonly profile = this.profileState.asReadonly();

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      this.profileState.set(null);
      if (!user) {
        return;
      }
      let creating = false;
      const unsubscribe = onSnapshot(
        doc(this.db, 'users', user.uid),
        (snap) => {
          if (snap.exists()) {
            this.profileState.set(toProfile(snap));
          } else if (!creating) {
            creating = true;
            this.createProfile(user).catch((error: unknown) => {
              creating = false;
              console.error('Could not create profile', error);
            });
          }
        },
        (error) => console.error('Profile listener failed', error),
      );
      this.indexEmail(user);
      onCleanup(unsubscribe);
    });
  }

  private requireUid(): string {
    const uid = this.auth.uid();
    if (!uid) {
      throw new AppError('Sign in first.');
    }
    return uid;
  }

  private async createProfile(user: User): Promise<void> {
    await setDoc(doc(this.db, 'users', user.uid), {
      uid: user.uid,
      displayName: cleanDisplayName(user.displayName),
      username: null,
      photoURL: user.photoURL ?? null,
      onboardingSeen: false,
      stats: { wins: 0, losses: 0, draws: 0, rating: 1200 },
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });
  }

  /** Lets friends find this player by email without exposing emails in public profiles. */
  private indexEmail(user: User): void {
    const email = user.email?.toLowerCase();
    if (!email || !user.emailVerified || this.indexedEmails.has(email)) {
      return;
    }
    this.indexedEmails.add(email);
    setDoc(doc(this.db, 'emails', email), { uid: user.uid }).catch((error: unknown) => {
      this.indexedEmails.delete(email);
      console.error('Could not index email', error);
    });
  }

  async skipOnboarding(): Promise<void> {
    await updateDoc(doc(this.db, 'users', this.requireUid()), { onboardingSeen: true });
  }

  async isUsernameAvailable(name: string): Promise<boolean> {
    const snap = await getDoc(doc(this.db, 'usernames', name));
    return !snap.exists() || snap.data()['uid'] === this.auth.uid();
  }

  /** Saves display name and, if given, claims the username atomically so it stays unique. */
  async saveProfile(input: { displayName: string; username: string }): Promise<void> {
    const uid = this.requireUid();
    const displayName = cleanDisplayName(input.displayName);
    const username = normalizeUsername(input.username);
    if (username) {
      const problem = usernameProblem(username);
      if (problem) {
        throw new AppError(problem);
      }
    }

    await runTransaction(this.db, async (tx) => {
      const userRef = doc(this.db, 'users', uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new AppError('Your profile is still loading. Try again in a moment.');
      }
      const current = userSnap.data() as UserProfile;
      const updates: Record<string, unknown> = { displayName, onboardingSeen: true };

      if (username && username !== current.username) {
        const nameRef = doc(this.db, 'usernames', username);
        const nameSnap = await tx.get(nameRef);
        if (nameSnap.exists()) {
          throw new AppError(`@${username} is taken. Pick another.`);
        }
        tx.set(nameRef, { uid });
        if (current.username) {
          tx.delete(doc(this.db, 'usernames', current.username));
        }
        updates['username'] = username;
      }
      tx.update(userRef, updates);
    });
  }

  /** Finds a player by email, @username or player ID. */
  async lookup(query: string): Promise<UserProfile> {
    const value = query.trim();
    if (!value) {
      throw new AppError("Enter a friend's email, @username or player ID.");
    }

    let uid: string;
    if (EMAIL_PATTERN.test(value)) {
      const snap = await getDoc(doc(this.db, 'emails', value.toLowerCase()));
      if (!snap.exists()) {
        throw new AppError(
          'No player has signed in with that email yet. Ask them to sign in once, then try again.',
        );
      }
      uid = snap.data()['uid'] as string;
    } else if (UID_PATTERN.test(value)) {
      uid = value;
    } else {
      const name = normalizeUsername(value);
      if (usernameProblem(name)) {
        throw new AppError("That doesn't look like an email, @username or player ID.");
      }
      const snap = await getDoc(doc(this.db, 'usernames', name));
      if (!snap.exists()) {
        throw new AppError(`No player goes by @${name}.`);
      }
      uid = snap.data()['uid'] as string;
    }

    const profile = await getDoc(doc(this.db, 'users', uid));
    if (!profile.exists()) {
      throw new AppError('No player found with that ID.');
    }
    return toProfile(profile);
  }
}
