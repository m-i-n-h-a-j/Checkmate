import { Service } from '@angular/core';
import { Room } from '../models';
import { millisOf } from './clock';

interface SentMove {
  plies: number;
  at: number;
}

/**
 * Estimates how far the server clock is ahead of this device, so running clocks and flag calls
 * line up with the server timestamps that firestore.rules judges by.
 *
 * Two kinds of evidence bracket the offset:
 * - a move seen arriving was stamped before we received it (a lower bound);
 * - our own move was stamped after we sent it (an upper bound).
 */
@Service()
export class ServerClock {
  private lower = -Infinity;
  private upper = Infinity;
  private readonly lastSeen = new Map<string, number | null>();
  private readonly sent = new Map<string, SentMove>();

  /** Milliseconds to add to Date.now() to get server time. */
  offset(): number {
    if (Number.isFinite(this.lower) && Number.isFinite(this.upper)) {
      return (this.lower + this.upper) / 2;
    }
    if (Number.isFinite(this.lower)) return this.lower;
    if (Number.isFinite(this.upper)) return this.upper;
    return 0;
  }

  now(): number {
    return Date.now() + this.offset();
  }

  /** Call right before writing a move that brings the game to `plies`. */
  markSent(code: string, plies: number): void {
    this.sent.set(code, { plies, at: Date.now() });
  }

  /** Feed every snapshot of a followed room. Pending local writes carry no server time yet. */
  observe(room: Room, hasPendingWrites: boolean): void {
    const stamp = room.lastMoveAt && !hasPendingWrites ? millisOf(room.lastMoveAt) : null;
    const known = this.lastSeen.has(room.code);
    const previous = this.lastSeen.get(room.code) ?? null;
    if (hasPendingWrites) {
      return;
    }
    this.lastSeen.set(room.code, stamp);
    if (stamp === null || stamp === previous) {
      return;
    }

    const now = Date.now();
    const mine = this.sent.get(room.code);
    if (mine && mine.plies === room.moves.length) {
      this.sent.delete(room.code);
      this.bound('upper', stamp - mine.at);
    } else if (known) {
      // Only moves that arrive while watching count; a stamp loaded on page open may be old.
      this.bound('lower', stamp - now);
    }
  }

  private bound(kind: 'lower' | 'upper', value: number): void {
    if (kind === 'lower') {
      this.lower = Math.max(this.lower, value);
      if (this.lower > this.upper) this.upper = Infinity;
    } else {
      this.upper = Math.min(this.upper, value);
      if (this.upper < this.lower) this.lower = -Infinity;
    }
  }
}
