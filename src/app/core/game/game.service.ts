import { Service, inject } from '@angular/core';
import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIRESTORE } from '../firebase/firebase';
import { GameEndReason, GameResult, Room } from '../models';
import { toProfile } from '../profile/profile.service';
import { toRoom } from '../rooms/rooms.service';
import type { PlayedMove } from './chess-game';
import { settledClocks } from './clock';
import { hasBareKing, opposite, sideToMove } from './notation';
import type { ReactionEmoji } from './reactions';
import { Score, statsAfter } from './rating';
import { ServerClock } from './server-clock.service';

interface Ending {
  result: GameResult;
  reason: GameEndReason;
}

/** In-game actions. Every write here is shaped to pass the game rules in firestore.rules. */
@Service()
export class GameService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly serverClock = inject(ServerClock);

  /**
   * Plays a move. Ordinary moves are plain updates, so the board updates instantly from the local
   * write. A move that ends the game also records the result and both players' stats.
   */
  async move(room: Room, move: PlayedMove): Promise<void> {
    const plies = room.moves.length;
    this.serverClock.markSent(room.code, plies + 1);
    if (!move.outcome) {
      await updateDoc(doc(this.db, 'rooms', room.code), this.moveFields(room, move));
      return;
    }
    const { result, reason } = move.outcome;
    await this.finish(room.code, plies, (current) => ({
      ...this.moveFields(current, move),
      result,
      reason,
    }));
  }

  resign(room: Room): Promise<boolean> {
    return this.finish(room.code, null, (current) => {
      const uid = this.auth.uid();
      if (current.moves.length < 2) return null;
      return { result: current.whiteUid === uid ? 'black' : 'white', reason: 'resign' };
    });
  }

  abort(room: Room): Promise<boolean> {
    return this.finish(room.code, null, (current) =>
      current.moves.length < 2 ? { result: 'aborted', reason: 'aborted' } : null,
    );
  }

  /**
   * Sends a reaction. Both players share the one slot on the room, which is what keeps the counter
   * honest and the reactions spaced out; a write that loses the race is dropped rather than retried,
   * because by then the other player's reaction is already on screen.
   */
  async react(room: Room, emoji: ReactionEmoji): Promise<void> {
    await updateDoc(doc(this.db, 'rooms', room.code), {
      reaction: {
        uid: this.auth.uid(),
        emoji,
        at: serverTimestamp(),
        n: (room.reaction?.n ?? 0) + 1,
      },
    });
  }

  async offerDraw(room: Room): Promise<void> {
    await updateDoc(doc(this.db, 'rooms', room.code), { drawOffer: this.auth.uid() });
  }

  /** Withdraws your own offer or declines the opponent's. */
  async clearDrawOffer(room: Room): Promise<void> {
    await updateDoc(doc(this.db, 'rooms', room.code), { drawOffer: null });
  }

  acceptDraw(room: Room): Promise<boolean> {
    return this.finish(room.code, null, (current) =>
      current.drawOffer && current.drawOffer !== this.auth.uid()
        ? { result: 'draw', reason: 'agreement' }
        : null,
    );
  }

  /**
   * Calls the flag on the side to move. It's a draw when the waiting side has only a king left,
   * which only that side may claim, so the flagged player leaves that case to their opponent.
   */
  claimTimeout(room: Room): Promise<boolean> {
    return this.finish(room.code, room.moves.length, (current) => {
      const flagged = sideToMove(current.moves.length);
      const winner = opposite(flagged);
      const bareKing = hasBareKing(current.fen, winner);
      const iAmWinner =
        (winner === 'white' ? current.whiteUid : current.blackUid) === this.auth.uid();
      if (bareKing && !iAmWinner) return null;
      return { result: bareKing ? 'draw' : winner, reason: 'timeout' };
    });
  }

  private moveFields(room: Room, move: PlayedMove): Record<string, unknown> {
    const uid = this.auth.uid();
    return {
      moves: [...room.moves, move.uci],
      fen: move.fen,
      lastMoveAt: serverTimestamp(),
      prevMoveAt: room.lastMoveAt,
      ...settledClocks(room),
      drawOffer: room.drawOffer === uid ? uid : null,
    };
  }

  /**
   * Ends a live game in one transaction: the room's result plus, for rated results, both players'
   * new stats. `build` sees the latest room and returns null when the ending no longer applies.
   */
  private finish(
    code: string,
    expectedPlies: number | null,
    build: (room: Room) => (Ending & Record<string, unknown>) | null,
  ): Promise<boolean> {
    const roomRef = doc(this.db, 'rooms', code);
    return runTransaction(this.db, async (tx) => {
      const room = toRoom(await tx.get(roomRef));
      if (room.status !== 'live' || !room.whiteUid || !room.blackUid) return false;
      if (expectedPlies !== null && room.moves.length !== expectedPlies) return false;
      const ending = build(room);
      if (!ending) return false;

      const fields: Record<string, unknown> = {
        ...ending,
        status: 'finished',
        endedAt: serverTimestamp(),
        endedBy: this.auth.uid(),
      };
      if (ending.result !== 'aborted') {
        const whiteRef = doc(this.db, 'users', room.whiteUid);
        const blackRef = doc(this.db, 'users', room.blackUid);
        const white = toProfile(await tx.get(whiteRef)).stats;
        const black = toProfile(await tx.get(blackRef)).stats;
        const whiteScore: Score =
          ending.result === 'white' ? 1 : ending.result === 'draw' ? 0.5 : 0;
        const whiteNext = statsAfter(white, black.rating, whiteScore);
        const blackNext = statsAfter(black, white.rating, (1 - whiteScore) as Score);
        tx.update(whiteRef, { stats: whiteNext, lastGame: code });
        tx.update(blackRef, { stats: blackNext, lastGame: code });
        fields['whiteRatingDiff'] = whiteNext.rating - white.rating;
        fields['blackRatingDiff'] = blackNext.rating - black.rating;
      }
      tx.update(roomRef, fields);
      return true;
    });
  }
}
