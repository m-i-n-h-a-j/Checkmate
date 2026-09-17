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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
    timeControl: { initial: 600, increment: 0 },
    hostColor: 'random',
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
    rematchOf: null,
    rematch: null,
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
      whiteUid: 'bob',
      blackUid: 'alice',
      whiteMs: 600_000,
      blackMs: 600_000,
    };

    await assertFails(updateDoc(doc(as('alice'), 'rooms', 'ABC234'), { hostReady: true, ...live }));
    await assertSucceeds(updateDoc(doc(as('bob'), 'rooms', 'ABC234'), { guestReady: true }));
    await assertFails(updateDoc(doc(as('eve'), 'rooms', 'ABC234'), { hostReady: true, ...live }));
    await assertFails(
      updateDoc(doc(as('alice'), 'rooms', 'ABC234'), { hostReady: true, ...live, whiteMs: 900_000 }),
    );
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'rooms', 'ABC234'), { hostReady: true, ...live }),
    );
  });

  it("deals colors the way the host asked", async () => {
    await seedRoom(
      'ABC234',
      room('ABC234', 'alice', {
        guestUid: 'bob',
        guest: player('bob'),
        hostReady: true,
        hostColor: 'white',
      }),
    );
    const live = (white: string, black: string) => ({
      guestReady: true,
      status: 'live',
      startedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 1e8),
      whiteUid: white,
      blackUid: black,
      whiteMs: 600_000,
      blackMs: 600_000,
    });
    await assertFails(updateDoc(doc(as('bob'), 'rooms', 'ABC234'), live('bob', 'alice')));
    await assertFails(updateDoc(doc(as('bob'), 'rooms', 'ABC234'), live('bob', 'bob')));
    await assertSucceeds(updateDoc(doc(as('bob'), 'rooms', 'ABC234'), live('alice', 'bob')));
  });

  it('lets only the host change the clock and colors while waiting', async () => {
    await seedRoom('ABC234', room('ABC234', 'alice', { guestUid: 'bob', guest: player('bob') }));
    const settings = { timeControl: { initial: 180, increment: 2 }, hostColor: 'black' };
    await assertFails(updateDoc(doc(as('bob'), 'rooms', 'ABC234'), settings));
    await assertFails(
      updateDoc(doc(as('alice'), 'rooms', 'ABC234'), {
        ...settings,
        timeControl: { initial: 420, increment: 0 },
      }),
    );
    await assertSucceeds(updateDoc(doc(as('alice'), 'rooms', 'ABC234'), settings));
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

describe('games', () => {
  const ago = (ms: number) => Timestamp.fromMillis(Date.now() - ms);
  type Stats = typeof stats;

  beforeEach(async () => {
    await seedUser('alice');
    await seedUser('bob');
    await seedUser('eve');
  });

  /** Alice plays White against Bob in a 3+2 game. */
  function game(extra: Record<string, unknown> = {}) {
    return room('GAME22', 'alice', {
      status: 'live',
      guestUid: 'bob',
      guest: player('bob'),
      startedAt: Timestamp.now(),
      timeControl: { initial: 180, increment: 2 },
      whiteUid: 'alice',
      blackUid: 'bob',
      whiteMs: 180_000,
      blackMs: 180_000,
      ...extra,
    });
  }

  const ref = (uid: string) => doc(as(uid), 'rooms', 'GAME22');

  function finish(
    uid: string,
    fields: Record<string, unknown>,
    next: { alice: Stats; bob: Stats },
  ): Promise<void> {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.update(doc(db, 'rooms', 'GAME22'), {
      status: 'finished',
      endedAt: serverTimestamp(),
      endedBy: uid,
      whiteRatingDiff: next.alice.rating - 1200,
      blackRatingDiff: next.bob.rating - 1200,
      ...fields,
    });
    batch.update(doc(db, 'users', 'alice'), { stats: next.alice, lastGame: 'GAME22' });
    batch.update(doc(db, 'users', 'bob'), { stats: next.bob, lastGame: 'GAME22' });
    return batch.commit();
  }

  const aliceWins = {
    alice: { ...stats, wins: 1, rating: 1216 },
    bob: { ...stats, losses: 1, rating: 1184 },
  };
  const bobWins = {
    alice: { ...stats, losses: 1, rating: 1184 },
    bob: { ...stats, wins: 1, rating: 1216 },
  };
  const drawn = { alice: { ...stats, draws: 1 }, bob: { ...stats, draws: 1 } };

  it('lets only the side to move play', async () => {
    await seedRoom('GAME22', game());
    const move = { moves: ['e2e4'], fen: 'x', lastMoveAt: serverTimestamp() };
    await assertFails(updateDoc(ref('bob'), move));
    await assertFails(updateDoc(ref('eve'), move));
    await assertFails(updateDoc(ref('alice'), { ...move, moves: ['e2e9'] }));
    await assertSucceeds(updateDoc(ref('alice'), move));
  });

  it('keeps the move list append-only', async () => {
    const lastMoveAt = ago(4_000);
    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], lastMoveAt, prevMoveAt: ago(9_000) }));
    const move = { fen: 'x', lastMoveAt: serverTimestamp(), prevMoveAt: lastMoveAt };
    await assertFails(updateDoc(ref('alice'), { ...move, moves: ['d2d4', 'e7e5', 'g1f3'] }));
    await assertFails(
      updateDoc(ref('alice'), { ...move, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] }),
    );
    await assertFails(
      updateDoc(ref('alice'), { ...move, moves: ['e2e4', 'e7e5', 'g1f3'], prevMoveAt: ago(1) }),
    );
    await assertSucceeds(updateDoc(ref('alice'), { ...move, moves: ['e2e4', 'e7e5', 'g1f3'] }));
  });

  it("settles the opponent's clock from server timestamps", async () => {
    // White's second move took exactly 4 seconds.
    const lastMoveAt = Timestamp.fromMillis(Date.now() - 1_000);
    const prevMoveAt = Timestamp.fromMillis(lastMoveAt.toMillis() - 4_000);
    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5', 'g1f3'], lastMoveAt, prevMoveAt }));
    const move = {
      moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      fen: 'x',
      lastMoveAt: serverTimestamp(),
      prevMoveAt: lastMoveAt,
    };
    await assertFails(updateDoc(ref('bob'), move));
    await assertFails(updateDoc(ref('bob'), { ...move, whiteMs: 180_000 }));
    await assertSucceeds(updateDoc(ref('bob'), { ...move, whiteMs: 178_000 }));
  });

  it('rejects a move once the mover is out of time', async () => {
    const lastMoveAt = ago(5_000);
    await seedRoom(
      'GAME22',
      game({ moves: ['e2e4', 'e7e5'], whiteMs: 1_000, lastMoveAt, prevMoveAt: ago(8_000) }),
    );
    await assertFails(
      updateDoc(ref('alice'), {
        moves: ['e2e4', 'e7e5', 'g1f3'],
        fen: 'x',
        lastMoveAt: serverTimestamp(),
        prevMoveAt: lastMoveAt,
      }),
    );
  });

  it('allows aborting only before both players have moved', async () => {
    const abort = (uid: string) => ({
      status: 'finished',
      result: 'aborted',
      reason: 'aborted',
      endedAt: serverTimestamp(),
      endedBy: uid,
    });
    await seedRoom('GAME22', game({ moves: ['e2e4'], lastMoveAt: ago(1_000) }));
    await assertFails(updateDoc(ref('eve'), abort('eve')));
    await assertSucceeds(updateDoc(ref('bob'), abort('bob')));

    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], lastMoveAt: ago(1_000) }));
    await assertFails(updateDoc(ref('bob'), abort('bob')));
  });

  it('makes a resignation record both players stats', async () => {
    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], lastMoveAt: ago(1_000) }));
    await assertFails(
      updateDoc(ref('bob'), {
        status: 'finished',
        result: 'white',
        reason: 'resign',
        endedAt: serverTimestamp(),
        endedBy: 'bob',
      }),
    );
    // Resigning can't hand yourself the win or soften the rating loss.
    await assertFails(finish('bob', { result: 'black', reason: 'resign' }, bobWins));
    await assertFails(
      finish(
        'bob',
        { result: 'white', reason: 'resign' },
        { ...aliceWins, bob: { ...aliceWins.bob, rating: 1200 } },
      ),
    );
    await assertSucceeds(finish('bob', { result: 'white', reason: 'resign' }, aliceWins));
  });

  it('never changes stats outside a game that ends in the same write', async () => {
    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], lastMoveAt: ago(1_000) }));
    await assertFails(
      updateDoc(doc(as('alice'), 'users', 'alice'), {
        stats: aliceWins.alice,
        lastGame: 'GAME22',
      }),
    );
  });

  it('ends a game on a mating move', async () => {
    const lastMoveAt = Timestamp.fromMillis(Date.now() - 1_000);
    const prevMoveAt = Timestamp.fromMillis(lastMoveAt.toMillis() - 3_000);
    await seedRoom('GAME22', game({ moves: ['f2f3', 'e7e5', 'g2g4'], lastMoveAt, prevMoveAt }));
    const mate = {
      moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
      fen: 'y',
      lastMoveAt: serverTimestamp(),
      prevMoveAt: lastMoveAt,
      whiteMs: 179_000,
      reason: 'checkmate',
    };
    await assertFails(finish('bob', { ...mate, result: 'white' }, aliceWins));
    await assertFails(finish('alice', { ...mate, result: 'black' }, bobWins));
    await assertSucceeds(finish('bob', { ...mate, result: 'black' }, bobWins));
  });

  it('handles draw offers', async () => {
    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], lastMoveAt: ago(1_000) }));
    await assertFails(updateDoc(ref('alice'), { drawOffer: 'bob' }));
    await assertFails(updateDoc(ref('eve'), { drawOffer: 'eve' }));
    await assertSucceeds(updateDoc(ref('alice'), { drawOffer: 'alice' }));
    await assertFails(finish('alice', { result: 'draw', reason: 'agreement' }, drawn));
    await assertSucceeds(finish('bob', { result: 'draw', reason: 'agreement' }, drawn));
  });

  it('lets a player decline a draw offer', async () => {
    await seedRoom(
      'GAME22',
      game({ moves: ['e2e4', 'e7e5'], lastMoveAt: ago(1_000), drawOffer: 'alice' }),
    );
    await assertSucceeds(updateDoc(ref('bob'), { drawOffer: null }));
  });

  it('calls the flag only when the server clock says time is up', async () => {
    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], lastMoveAt: ago(5_000) }));
    await assertFails(finish('bob', { result: 'black', reason: 'timeout' }, bobWins));

    await seedRoom('GAME22', game({ moves: ['e2e4', 'e7e5'], whiteMs: 4_000, lastMoveAt: ago(5_000) }));
    // The flagged player can't turn their loss into a draw.
    await assertFails(finish('alice', { result: 'draw', reason: 'timeout' }, drawn));
    await assertSucceeds(finish('alice', { result: 'black', reason: 'timeout' }, bobWins));
  });

  it('links a rematch between the same two players', async () => {
    await seedRoom('GAME22', game({ status: 'finished', result: 'white', reason: 'resign' }));
    const offer = (uid: string, invited: string, link = true) => {
      const db = as(uid);
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'rooms', 'REMA22'),
        room('REMA22', uid, {
          type: 'rematch',
          hostReady: true,
          invitedUid: invited,
          invited: player(invited),
          rematchOf: 'GAME22',
        }),
      );
      if (link) {
        batch.update(doc(db, 'rooms', 'GAME22'), { rematch: 'REMA22' });
      }
      return batch.commit();
    };
    await assertFails(offer('eve', 'alice'));
    await assertFails(offer('bob', 'eve'));
    await assertFails(offer('bob', 'alice', false));
    await assertSucceeds(offer('bob', 'alice'));
    await assertFails(
      updateDoc(doc(as('eve'), 'rooms', 'REMA22'), { guestUid: 'eve', guest: player('eve') }),
    );
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'rooms', 'REMA22'), { guestUid: 'alice', guest: player('alice') }),
    );
  });
});
