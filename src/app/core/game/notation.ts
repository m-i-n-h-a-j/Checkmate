/*
 * Notation helpers with no chess engine behind them, so the app shell can use them without
 * loading chess.js.
 */
import type { Square } from 'chess.js';
import { Side } from '../models';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Promotion = 'q' | 'r' | 'b' | 'n';

const UCI_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export function sideOf(color: 'w' | 'b'): Side {
  return color === 'w' ? 'white' : 'black';
}

export function opposite(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

/** Side to move after a number of plies. */
export function sideToMove(plies: number): Side {
  return plies % 2 === 0 ? 'white' : 'black';
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: Promotion } | null {
  const match = UCI_PATTERN.exec(uci);
  if (!match) {
    return null;
  }
  const [, from, to, promotion] = match;
  return { from: from as Square, to: to as Square, promotion: promotion as Promotion | undefined };
}

/** True when a side has nothing but its king, so it can never deliver mate. */
export function hasBareKing(fen: string, side: Side): boolean {
  const board = fen.split(' ')[0];
  const pieces = side === 'white' ? /[PNBRQ]/ : /[pnbrq]/;
  return !pieces.test(board);
}
