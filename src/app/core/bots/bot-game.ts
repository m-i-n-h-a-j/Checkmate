import { FREE_PLIES } from '../game/clock';
import { sideToMove } from '../game/notation';
import { GameEndReason, GameResult, Side, TimeControl } from '../models';

export type BotColorChoice = Side | 'random';

/**
 * A game against a bot. It lives only on this device: nothing is sent to the server.
 *
 * Clocks work like online games (each side's first move is free, then Fischer increments), but they
 * pause while the page is hidden or closed, since the bot is waiting anyway.
 */
export interface BotGame {
  id: string;
  botId: string;
  playerColor: Side;
  colorChoice: BotColorChoice;
  /** null for an untimed game. */
  timeControl: TimeControl | null;
  /** UCI moves. */
  moves: string[];
  /** Time left for each side when the current turn began. */
  whiteMs: number;
  blackMs: number;
  /** When the running clock started, or null while clocks are stopped or paused. */
  turnStartedAt: number | null;
  status: 'live' | 'finished';
  result: Exclude<GameResult, 'aborted'> | null;
  reason: GameEndReason | null;
  startedAt: number;
  endedAt: number | null;
  takebacks: number;
  hints: number;
}

export interface BotClockReading {
  white: number;
  black: number;
  running: Side | null;
}

export function newBotGame(
  botId: string,
  colorChoice: BotColorChoice,
  timeControl: TimeControl | null,
  now: number,
  random: () => number = Math.random,
): BotGame {
  const clock = timeControl ? timeControl.initial * 1000 : 0;
  return {
    id: `${now.toString(36)}${Math.floor(random() * 1e6).toString(36)}`,
    botId,
    playerColor: colorChoice === 'random' ? (random() < 0.5 ? 'white' : 'black') : colorChoice,
    colorChoice,
    timeControl,
    moves: [],
    whiteMs: clock,
    blackMs: clock,
    turnStartedAt: null,
    status: 'live',
    result: null,
    reason: null,
    startedAt: now,
    endedAt: null,
    takebacks: 0,
    hints: 0,
  };
}

function clocksRun(game: BotGame): boolean {
  return game.timeControl !== null && game.status === 'live' && game.moves.length >= FREE_PLIES;
}

export function readBotClocks(game: BotGame, now: number): BotClockReading {
  const reading: BotClockReading = { white: game.whiteMs, black: game.blackMs, running: null };
  if (!clocksRun(game)) return reading;
  const side = sideToMove(game.moves.length);
  reading.running = side;
  if (game.turnStartedAt !== null) {
    reading[side] = Math.max(0, reading[side] - (now - game.turnStartedAt));
  }
  return reading;
}

/** The side to move, if its time is up. */
export function botFlagged(game: BotGame, now: number): Side | null {
  const reading = readBotClocks(game, now);
  return reading.running && reading[reading.running] <= 0 ? reading.running : null;
}

/** Plays a move: settles the mover's clock with the increment and starts the other one. */
export function withMove(game: BotGame, uci: string, now: number): BotGame {
  const mover = sideToMove(game.moves.length);
  const next: BotGame = { ...game, moves: [...game.moves, uci] };
  if (game.timeControl && clocksRun(game)) {
    const left = readBotClocks(game, now)[mover] + game.timeControl.increment * 1000;
    if (mover === 'white') next.whiteMs = left;
    else next.blackMs = left;
  }
  next.turnStartedAt = clocksRun(next) ? now : null;
  return next;
}

export function withResult(
  game: BotGame,
  result: Exclude<GameResult, 'aborted'>,
  reason: GameEndReason,
  now: number,
): BotGame {
  const stopped = pauseBotGame(game, now);
  return { ...stopped, status: 'finished', result, reason, endedAt: now, turnStartedAt: null };
}

/** Undoes plies, giving the side back the clock it had before. The running turn restarts now. */
export function withTakeback(game: BotGame, plies: number, now: number): BotGame {
  const count = Math.min(plies, game.moves.length);
  if (count === 0 || game.status !== 'live') return game;
  const next: BotGame = {
    ...pauseBotGame(game, now),
    moves: game.moves.slice(0, game.moves.length - count),
    takebacks: game.takebacks + 1,
  };
  return resumeBotGame(next, now);
}

/** Stops the running clock, keeping the time used so far. */
export function pauseBotGame(game: BotGame, now: number): BotGame {
  if (game.turnStartedAt === null || !clocksRun(game)) return { ...game, turnStartedAt: null };
  const reading = readBotClocks(game, now);
  return { ...game, whiteMs: reading.white, blackMs: reading.black, turnStartedAt: null };
}

export function resumeBotGame(game: BotGame, now: number): BotGame {
  return { ...game, turnStartedAt: clocksRun(game) ? now : null };
}

// ---------- storage ----------

const GAME_KEY = 'checkmate.botGame';

function isBotGame(value: unknown): value is BotGame {
  const game = value as Partial<BotGame> | null;
  return (
    !!game &&
    typeof game.botId === 'string' &&
    Array.isArray(game.moves) &&
    game.moves.every((move) => typeof move === 'string') &&
    (game.playerColor === 'white' || game.playerColor === 'black') &&
    (game.status === 'live' || game.status === 'finished') &&
    typeof game.whiteMs === 'number' &&
    typeof game.blackMs === 'number'
  );
}

export function loadBotGame(): BotGame | null {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isBotGame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBotGame(game: BotGame | null): void {
  try {
    if (game) localStorage.setItem(GAME_KEY, JSON.stringify(game));
    else localStorage.removeItem(GAME_KEY);
  } catch {
    // Private mode or full storage: the game just won't survive a reload.
  }
}
