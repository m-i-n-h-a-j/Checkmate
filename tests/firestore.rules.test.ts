import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Firestore,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-checkmate',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string) =>
  env
    .authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true })
    .firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const player = (uid: string) => ({ uid, displayName: uid, username: null, photoURL: null });
const stats = { wins: 0, losses: 0, draws: 0, rating: 1200 };

async function seed(write: (db: Firestore) => Promise<unknown>): Promise<void> {
  await env.withSecurityRulesDisabled((ctx) =>
    write(ctx.firestore() as unknown as Firestore).then(() => undefined),
  );
}

async function seedUser(uid: string, username: string | null = null): Promise<void> {
  await seed(async (db) => {
    await setDoc(doc(db, 'users', uid), {
      uid,
      displayName: uid,
      username,
      photoURL: null,
      onboardingSeen: true,
      stats,
      createdAt: Timestamp.now(),
      lastActive: Timestamp.now(),
    });
    if (username) {
      await setDoc(doc(db, 'usernames', username), { uid });
    }
  });
}

async function seedFriends(a: string, b: string): Promise<void> {
  const id = a < b ? `${a}_${b}` : `${b}_${a}`;
  await seed((db) =>
    setDoc(doc(db, 'friendships', id), { members: [a, b], createdAt: Timestamp.now() }),
  );
}

function room(code: string, host: string, extra: Record<string, unknown> = {}) {
  return {
    code,
    type: 'code',
    status: 'waiting',
    hostUid: host,
    host: player(host),
    guestUid: null,
    guest: null,
    invitedUid: null,
    invited: null,
    friendshipId: null,
    hostReady: false,
    guestReady: false,
    createdAt: serverTimestamp(),
    startedAt: null,
    endedAt: null,
    endedBy: null,
    expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    ...extra,
  };
}

async function seedRoom(code: string, data: Record<string, unknown>): Promise<void> {
  await seed((db) => setDoc(doc(db, 'rooms', code), { ...data, createdAt: Timestamp.now() }));
}

describe('users', () => {
  it('lets a player create their own profile with default stats', async () => {
    await assertSucceeds(
      setDoc(doc(as('alice'), 'users', 'alice'), {
        uid: 'alice',
        displayName: 'Alice',
        username: null,
        photoURL: null,
        onboardingSeen: false,
        stats,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      }),
    );
  });

  it('rejects a profile created with boosted stats or for someone else', async () => {
    const data = {
      uid: 'alice',
      displayName: 'Alice',
      username: null,
      photoURL: null,
      onboardingSeen: false,
      stats: { ...stats, rating: 3000 },
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    };
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice'), data));
    await assertFails(setDoc(doc(as('bob'), 'users', 'alice'), { ...data, stats }));
  });

  it('never lets a client edit stats', async () => {
    await seedUser('alice');
    await assertFails(updateDoc(doc(as('alice'), 'users', 'alice'), { 'stats.wins': 99 }));
  });

  it('allows the presence heartbeat and is publicly readable', async () => {
    await seedUser('alice');
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'users', 'alice'), { lastActive: serverTimestamp() }),
    );
    await assertSucceeds(getDoc(doc(anon(), 'users', 'alice')));
  });
});

describe('usernames', () => {
  it('claims a username atomically with the profile', async () => {
    await seedUser('alice');
    const db = as('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', 'queen_alice'), { uid: 'alice' });
    batch.update(doc(db, 'users', 'alice'), { username: 'queen_alice' });
    await assertSucceeds(batch.commit());
  });

  it('keeps usernames unique', async () => {
    await seedUser('alice', 'queen');
    await seedUser('bob');
    const db = as('bob');
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', 'queen'), { uid: 'bob' });
    batch.update(doc(db, 'users', 'bob'), { username: 'queen' });
    await assertFails(batch.commit());
  });

  it('rejects setting a username without claiming it', async () => {
    await seedUser('bob');
    await assertFails(updateDoc(doc(as('bob'), 'users', 'bob'), { username: 'free_name' }));
  });

  it('rejects malformed usernames', async () => {
    await seedUser('bob');
    const db = as('bob');
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', 'Bad Name'), { uid: 'bob' });
    batch.update(doc(db, 'users', 'bob'), { username: 'Bad Name' });
    await assertFails(batch.commit());
  });

  it('lets a player change username and release the old one', async () => {
    await seedUser('alice', 'old_name');
    const db = as('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', 'new_name'), { uid: 'alice' });
    batch.delete(doc(db, 'usernames', 'old_name'));
    batch.update(doc(db, 'users', 'alice'), { username: 'new_name' });
    await assertSucceeds(batch.commit());
  });
});

describe('emails', () => {
  it('indexes only your own verified email', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'emails', 'alice@example.com'), { uid: 'alice' }));
    await assertFails(setDoc(doc(as('bob'), 'emails', 'alice@example.com'), { uid: 'bob' }));
  });

  it('allows exact lookups but not listing', async () => {
    await seed((db) => setDoc(doc(db, 'emails', 'alice@example.com'), { uid: 'alice' }));
    await assertSucceeds(getDoc(doc(as('bob'), 'emails', 'alice@example.com')));
    await assertFails(getDocs(collection(as('bob'), 'emails')));
    await assertFails(getDoc(doc(anon(), 'emails', 'alice@example.com')));
  });
});

describe('friends', () => {
  const request = (from: string, to: string) => ({
    from,
    to,
    fromPlayer: player(from),
    toPlayer: player(to),
    createdAt: serverTimestamp(),
  });

  beforeEach(async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('eve');
  });

  it('sends a request, but not to yourself', async () => {
    await assertSucceeds(
      setDoc(doc(as('alice'), 'friendRequests', 'alice_bob'), request('alice', 'bob')),
    );
    await assertFails(
      setDoc(doc(as('alice'), 'friendRequests', 'alice_alice'), request('alice', 'alice')),
    );
  });

  it('rejects requests sent on behalf of someone else', async () => {
    await assertFails(
      setDoc(doc(as('eve'), 'friendRequests', 'alice_bob'), request('alice', 'bob')),
    );
  });

  it('shows requests only to the two players involved', async () => {
    await seed((db) =>
      setDoc(doc(db, 'friendRequests', 'alice_bob'), {
        ...request('alice', 'bob'),
        createdAt: Timestamp.now(),
      }),
    );
    await assertSucceeds(
      getDocs(query(collection(as('bob'), 'friendRequests'), where('to', '==', 'bob'))),
    );
    await assertSucceeds(getDoc(doc(as('alice'), 'friendRequests', 'bob_alice')));
    await assertFails(getDoc(doc(as('eve'), 'friendRequests', 'alice_bob')));
  });

  it('lets the recipient accept', async () => {
    await seed((db) =>
      setDoc(doc(db, 'friendRequests', 'alice_bob'), {
        ...request('alice', 'bob'),
        createdAt: Timestamp.now(),
      }),
    );
    const db = as('bob');
    const batch = writeBatch(db);
    batch.set(doc(db, 'friendships', 'alice_bob'), {
      members: ['alice', 'bob'],
      createdAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'friendRequests', 'alice_bob'));
    await assertSucceeds(batch.commit());
  });

  it('rejects a friendship nobody asked for', async () => {
    await assertFails(
      setDoc(doc(as('eve'), 'friendships', 'alice_eve'), {
        members: ['alice', 'eve'],
        createdAt: serverTimestamp(),
      }),
    );
    await seed((db) =>
      setDoc(doc(db, 'friendRequests', 'alice_bob'), {
        ...request('alice', 'bob'),
        createdAt: Timestamp.now(),
      }),
    );
    // The sender can't accept their own request.
    await assertFails(
      setDoc(doc(as('alice'), 'friendships', 'alice_bob'), {
        members: ['alice', 'bob'],
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("allows the app's own friend listeners", async () => {
    await seedFriends('alice', 'bob');
    await assertSucceeds(
      getDocs(
        query(collection(as('alice'), 'friendships'), where('members', 'array-contains', 'alice')),
      ),
    );
    await assertSucceeds(
      getDocs(query(collection(as('alice'), 'friendRequests'), where('from', '==', 'alice'))),
    );
    await assertSucceeds(getDoc(doc(as('alice'), 'friendships', 'alice_eve')));
    await assertFails(
      getDocs(
        query(collection(as('eve'), 'friendships'), where('members', 'array-contains', 'alice')),
      ),
    );
  });

  it('lets either friend unfriend', async () => {
    await seedFriends('alice', 'bob');
    await assertFails(deleteDoc(doc(as('eve'), 'friendships', 'alice_bob')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'friendships', 'alice_bob')));
  });

  it('rejects requests between existing friends', async () => {
    await seedFriends('alice', 'bob');
    await assertFails(
      setDoc(doc(as('alice'), 'friendRequests', 'alice_bob'), request('alice', 'bob')),
    );
  });
});

describe('rooms', () => {
  beforeEach(async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('eve');
  });

  it('creates a code room', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'rooms', 'ABC234'), room('ABC234', 'alice')));
  });

  it('rejects rooms with bad codes or fake hosts', async () => {
    await assertFails(setDoc(doc(as('alice'), 'rooms', 'ABC10O'), room('ABC10O', 'alice')));
    await assertFails(setDoc(doc(as('eve'), 'rooms', 'ABC234'), room('ABC234', 'alice')));
  });

  it("doesn't let strangers list open room codes", async () => {
    await seedRoom('ABC234', room('ABC234', 'alice'));
    await assertFails(
      getDocs(query(collection(as('eve'), 'rooms'), where('status', '==', 'waiting'))),
    );
    await assertSucceeds(getDoc(doc(as('eve'), 'rooms', 'ABC234')));
  });

  it('shows live matches to everyone, including signed-out visitors', async () => {
    await seedRoom(
      'LIVE22',
      room('LIVE22', 'alice', {
        status: 'live',
        guestUid: 'bob',
        guest: player('bob'),
        startedAt: Timestamp.now(),
      }),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(anon(), 'rooms'),
          where('status', '==', 'live'),
          orderBy('startedAt', 'desc'),
          limit(24),
        ),
      ),
    );
  });

  it('lets anyone signed in take the open seat of a code room', async () => {
    await seedRoom('ABC234', room('ABC234', 'alice'));
    await assertSucceeds(
      updateDoc(doc(as('bob'), 'rooms', 'ABC234'), { guestUid: 'bob', guest: player('bob') }),
    );
    await assertFails(
      updateDoc(doc(as('eve'), 'rooms', 'ABC234'), { guestUid: 'eve', guest: player('eve') }),
    );
  });

  it('only allows challenges between friends', async () => {
    const challenge = room('CHAL22', 'alice', {
      type: 'challenge',
      invitedUid: 'bob',
      invited: player('bob'),
      friendshipId: 'alice_bob',
    });
    await assertFails(setDoc(doc(as('alice'), 'rooms', 'CHAL22'), challenge));
    await seedFriends('alice', 'bob');
    await assertSucceeds(setDoc(doc(as('alice'), 'rooms', 'CHAL22'), challenge));
  });

  it('saves a challenge seat for the invited friend', async () => {
    await seedRoom(
      'CHAL22',
      room('CHAL22', 'alice', {
        type: 'challenge',
        invitedUid: 'bob',
        invited: player('bob'),
        friendshipId: 'alice_bob',
      }),
    );
    await assertFails(
      updateDoc(doc(as('eve'), 'rooms', 'CHAL22'), { guestUid: 'eve', guest: player('eve') }),
    );
    await assertFails(
      updateDoc(doc(as('eve'), 'rooms', 'CHAL22'), {
        status: 'declined',
        endedAt: serverTimestamp(),
        endedBy: 'eve',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(as('bob'), 'rooms', 'CHAL22'), { guestUid: 'bob', guest: player('bob') }),
    );
  });

  it('goes live only when both players are ready', async () => {
    await seedRoom('ABC234', room('ABC234', 'alice', { guestUid: 'bob', guest: player('bob') }));
    const live = {
      status: 'live',
      startedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 1e8),
    };

    await assertFails(updateDoc(doc(as('alice'), 'rooms', 'ABC234'), { hostReady: true, ...live }));
    await assertSucceeds(updateDoc(doc(as('bob'), 'rooms', 'ABC234'), { guestReady: true }));
    await assertFails(updateDoc(doc(as('eve'), 'rooms', 'ABC234'), { hostReady: true, ...live }));
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'rooms', 'ABC234'), { hostReady: true, ...live }),
    );
  });

  it('lets only the players end a live match', async () => {
    await seedRoom(
      'LIVE22',
      room('LIVE22', 'alice', {
        status: 'live',
        guestUid: 'bob',
        guest: player('bob'),
        startedAt: Timestamp.now(),
      }),
    );
    const end = (uid: string) => ({ status: 'finished', endedAt: serverTimestamp(), endedBy: uid });
    await assertFails(updateDoc(doc(as('eve'), 'rooms', 'LIVE22'), end('eve')));
    await assertSucceeds(updateDoc(doc(as('bob'), 'rooms', 'LIVE22'), end('bob')));
  });

  it("allows the app's own room listeners", async () => {
    await seedRoom('ABC234', room('ABC234', 'alice', { guestUid: 'bob', guest: player('bob') }));
    const rooms = (uid: string) => collection(as(uid), 'rooms');
    const open = where('status', 'in', ['waiting', 'live']);
    await assertSucceeds(getDocs(query(rooms('alice'), where('hostUid', '==', 'alice'), open)));
    await assertSucceeds(getDocs(query(rooms('bob'), where('guestUid', '==', 'bob'), open)));
    await assertSucceeds(
      getDocs(
        query(rooms('bob'), where('invitedUid', '==', 'bob'), where('status', '==', 'waiting')),
      ),
    );
    await assertFails(getDocs(query(rooms('eve'), where('hostUid', '==', 'alice'), open)));
  });

  it('never deletes rooms from the client', async () => {
    await seedRoom('ABC234', room('ABC234', 'alice'));
    await assertFails(deleteDoc(doc(as('alice'), 'rooms', 'ABC234')));
  });
});
