import { Chess, PieceSymbol, Square } from 'chess.js';
import { GameEndReason, Side } from '../models';
import { parseUci, sideOf } from './notation';

/** An ending decided on the board: mate or one of the automatic draws. */
export interface BoardOutcome {
  result: Side | 'draw';
  reason: Extract<
    GameEndReason,
    'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty'
  >;
}

export interface Position {
  fen: string;
  turn: Side;
  check: boolean;
  lastMove: [Square, Square] | null;
  /** Legal destinations per origin square, in chessground's format. */
  dests: Map<Square, Square[]>;
  /** Legal moves in SAN, for typed move entry. */
  legal: string[];
  /** Played moves in SAN. */
  history: string[];
  outcome: BoardOutcome | null;
  /** Pieces a side has more of than the other, most valuable first. */
  imbalance: Record<Side, PieceSymbol[]>;
  /** White's material minus Black's, in pawns. */
  material: number;
  /** Plies that replayed cleanly. Less than the move count means the list holds an illegal move. */
  validPlies: number;
  /** The piece taken by the last move, if it took one. */
  lastCapture: Capture | null;
  /** The piece a pawn became on the last move, if it promoted. */
  lastPromotion: PawnPromotion | null;
  /** Where the side to move has its king. */
  kingSquare: Square | null;
}

export interface Capture {
  piece: PieceSymbol;
  /** Color of the captured piece. */
  color: Side;
  square: Square;
}

export interface PawnPromotion {
  piece: PieceSymbol;
  color: Side;
  square: Square;
}

export interface PlayedMove {
  uci: string;
  san: string;
  fen: string;
  captured: PieceSymbol | null;
  check: boolean;
  outcome: BoardOutcome | null;
}

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

function outcomeOf(chess: Chess): BoardOutcome | null {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: 'draw', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { result: 'draw', reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { result: 'draw', reason: 'fifty' };
  return null;
}

/**
 * Replays a game's move list. Keeps one chess.js instance and applies only the new moves when the
 * list grows, so following a live game stays cheap.
 */
export class ChessReplay {
  private chess = new Chess();
  private applied: string[] = [];
  private validPlies = 0;
  private sans: string[] = [];
  private lastMove: [Square, Square] | null = null;
  private lastCapture: Capture | null = null;
  private lastPromotion: PawnPromotion | null = null;

  sync(moves: readonly string[]): Position {
    const continues =
      moves.length >= this.applied.length && this.applied.every((uci, i) => moves[i] === uci);
    if (!continues) {
      this.chess = new Chess();
      this.applied = [];
      this.validPlies = 0;
      this.sans = [];
      this.lastMove = null;
      this.lastCapture = null;
      this.lastPromotion = null;
    }
    for (let i = this.applied.length; i < moves.length; i++) {
      this.applied.push(moves[i]);
      if (this.validPlies === i && this.apply(moves[i])) {
        this.validPlies++;
      }
    }
    return this.position();
  }

  /** Tries a move on the current position without keeping it. */
  preview(move: { from: string; to: string; promotion?: string } | string): PlayedMove | null {
    if (this.validPlies !== this.applied.length) {
      return null;
    }
    let played;
    try {
      played = this.chess.move(move);
    } catch {
      return null;
    }
    const result: PlayedMove = {
      uci: played.lan,
      san: played.san,
      fen: this.chess.fen(),
      captured: played.captured ?? null,
      check: this.chess.inCheck(),
      outcome: outcomeOf(this.chess),
    };
    this.chess.undo();
    return result;
  }

  /** Whether a move from one square to another needs a promotion piece. */
  isPromotion(from: string, to: string): boolean {
    return this.chess
      .moves({ square: from as Square, verbose: true })
      .some((move) => move.to === to && move.isPromotion());
  }

  private apply(uci: string): boolean {
    const move = parseUci(uci);
    if (!move) {
      return false;
    }
    try {
      const played = this.chess.move(move);
      this.sans.push(played.san);
      this.lastMove = [played.from, played.to];
      this.lastCapture = played.captured
        ? {
            piece: played.captured,
            color: played.color === 'w' ? 'black' : 'white',
            // En passant takes the pawn beside the destination, not on it.
            square: (played.isEnPassant() ? played.to[0] + played.from[1] : played.to) as Square,
          }
        : null;
      this.lastPromotion = played.promotion
        ? { piece: played.promotion, color: sideOf(played.color), square: played.to }
        : null;
      return true;
    } catch {
      return false;
    }
  }

  private position(): Position {
    const chess = this.chess;
    const outcome = outcomeOf(chess);
    const dests = new Map<Square, Square[]>();
    const legal: string[] = [];
    if (!outcome && this.validPlies === this.applied.length) {
      for (const move of chess.moves({ verbose: true })) {
        const list = dests.get(move.from);
        if (list) {
          if (!list.includes(move.to)) list.push(move.to);
        } else {
          dests.set(move.from, [move.to]);
        }
        legal.push(move.san);
      }
    }

    const counts: Record<Side, Record<PieceSymbol, number>> = {
      white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };
    const turn = chess.turn();
    let kingSquare: Square | null = null;
    for (const row of chess.board()) {
      for (const square of row) {
        if (!square) continue;
        counts[sideOf(square.color)][square.type]++;
        if (square.type === 'k' && square.color === turn) kingSquare = square.square;
      }
    }
    const imbalance: Record<Side, PieceSymbol[]> = { white: [], black: [] };
    let material = 0;
    for (const type of ORDER) {
      const diff = counts.white[type] - counts.black[type];
      const ahead = diff > 0 ? 'white' : 'black';
      imbalance[ahead].push(...Array<PieceSymbol>(Math.abs(diff)).fill(type));
      material += diff * VALUES[type];
    }

    return {
      fen: chess.fen(),
      turn: sideOf(chess.turn()),
      check: chess.inCheck(),
      lastMove: this.lastMove,
      dests,
      legal,
      history: [...this.sans],
      outcome,
      imbalance,
      material,
      validPlies: this.validPlies,
      lastCapture: this.lastCapture,
      lastPromotion: this.lastPromotion,
      kingSquare,
    };
  }
}
