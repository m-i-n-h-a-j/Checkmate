import { Timestamp } from 'firebase/firestore';
import { Room, Side } from '../models';
import { sideToMove } from './notation';

/** Each side's first move is free: clocks start once both players have moved. */
export const FREE_PLIES = 2;

export type ClockRoom = Pick<
  Room,
  | 'status'
  | 'timeControl'
  | 'moves'
  | 'whiteMs'
  | 'blackMs'
  | 'lastMoveAt'
  | 'prevMoveAt'
  | 'endedAt'
>;

export interface ClockReading {
  white: number;
  black: number;
  /** The side whose clock is ticking, if any. */
  running: Side | null;
}

/** Whole milliseconds, truncated the same way `timestamp.toMillis()` is in firestore.rules. */
export function millisOf(timestamp: Timestamp): number {
  return timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000);
}

/**
 * Clocks with the last mover's think time settled. Stored clocks leave that move open until the
 * opponent replies, because only then are both server timestamps known to the writer.
 * The next move writes exactly these values, and firestore.rules recomputes them.
 */
export function settledClocks(room: ClockRoom): { whiteMs: number; blackMs: number } {
  const initial = room.timeControl.initial * 1000;
  const clocks = { whiteMs: room.whiteMs ?? initial, blackMs: room.blackMs ?? initial };
  const plies = room.moves.length;
  if (plies > FREE_PLIES && room.lastMoveAt && room.prevMoveAt) {
    const spent = millisOf(room.lastMoveAt) - millisOf(room.prevMoveAt);
    const change = room.timeControl.increment * 1000 - spent;
    if (sideToMove(plies - 1) === 'white') {
      clocks.whiteMs += change;
    } else {
      clocks.blackMs += change;
    }
  }
  return clocks;
}

/** Time left on both clocks at a server time. A finished game's clocks stop when it ended. */
export function readClocks(room: ClockRoom, serverNow: number): ClockReading {
  const { whiteMs, blackMs } = settledClocks(room);
  const reading: ClockReading = { white: whiteMs, black: blackMs, running: null };
  const plies = room.moves.length;
  if (plies < FREE_PLIES || !room.lastMoveAt) {
    return reading;
  }
  const until = room.status === 'live' ? serverNow : room.endedAt ? millisOf(room.endedAt) : null;
  if (until === null) {
    return reading;
  }
  const side = sideToMove(plies);
  reading[side] -= Math.max(0, until - millisOf(room.lastMoveAt));
  reading[side] = Math.max(0, reading[side]);
  if (room.status === 'live') {
    reading.running = side;
  }
  return reading;
}

/** The side whose time ran out, judged at a server time. */
export function flaggedSide(room: ClockRoom, serverNow: number): Side | null {
  if (room.status !== 'live' || room.moves.length < FREE_PLIES || !room.lastMoveAt) {
    return null;
  }
  const side = sideToMove(room.moves.length);
  const left = side === 'white' ? room.whiteMs : room.blackMs;
  return left !== null && serverNow - millisOf(room.lastMoveAt) > left ? side : null;
}

/** "4:07", "0:42", or "9.3" under ten seconds. */
export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 10_000) {
    return (Math.floor(safe / 100) / 10).toFixed(1);
  }
  const total = Math.floor(safe / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
