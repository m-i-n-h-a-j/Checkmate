import { Timestamp } from 'firebase/firestore';
import { ClockRoom, flaggedSide, formatClock, millisOf, readClocks, settledClocks } from './clock';
import { expectedScore, ratingAfter, statsAfter } from './rating';

const at = (ms: number) => Timestamp.fromMillis(ms);

function room(overrides: Partial<ClockRoom> = {}): ClockRoom {
  return {
    status: 'live',
    timeControl: { initial: 180, increment: 2 },
    moves: [],
    whiteMs: 180_000,
    blackMs: 180_000,
    lastMoveAt: null,
    prevMoveAt: null,
    endedAt: null,
    ...overrides,
  };
}

describe('clocks', () => {
  it('truncates timestamps to whole milliseconds', () => {
    expect(millisOf(new Timestamp(10, 1_999_999))).toBe(10_001);
  });

  it('does not run before both players have moved', () => {
    const reading = readClocks(room({ moves: ['e2e4'], lastMoveAt: at(1000) }), 60_000);
    expect(reading).toEqual({ white: 180_000, black: 180_000, running: null });
  });

  it("runs the side to move's clock from the last move", () => {
    const reading = readClocks(
      room({ moves: ['e2e4', 'e7e5'], lastMoveAt: at(10_000), prevMoveAt: at(5_000) }),
      25_000,
    );
    expect(reading).toEqual({ white: 165_000, black: 180_000, running: 'white' });
  });

  it("settles the last mover's think time with the increment", () => {
    // White's second move (ply 3) took 4 seconds.
    const game = room({
      moves: ['e2e4', 'e7e5', 'g1f3'],
      lastMoveAt: at(14_000),
      prevMoveAt: at(10_000),
    });
    expect(settledClocks(game)).toEqual({ whiteMs: 178_000, blackMs: 180_000 });
    expect(readClocks(game, 20_000)).toEqual({ white: 178_000, black: 174_000, running: 'black' });
  });

  it('stops a finished game at the moment it ended', () => {
    const game = room({
      status: 'finished',
      moves: ['e2e4', 'e7e5'],
      lastMoveAt: at(10_000),
      prevMoveAt: at(5_000),
      endedAt: at(13_000),
    });
    expect(readClocks(game, 99_000)).toEqual({ white: 177_000, black: 180_000, running: null });
  });

  it('flags only once the stored time is used up', () => {
    const game = room({ moves: ['e2e4', 'e7e5'], whiteMs: 5_000, lastMoveAt: at(10_000) });
    expect(flaggedSide(game, 15_000)).toBeNull();
    expect(flaggedSide(game, 15_001)).toBe('white');
    expect(flaggedSide({ ...game, moves: ['e2e4'] }, 99_000)).toBeNull();
  });

  it('formats clocks', () => {
    expect(formatClock(247_000)).toBe('4:07');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(9_350)).toBe('9.3');
    expect(formatClock(-5)).toBe('0.0');
  });
});

describe('ratings', () => {
  it('moves equal players by half the K-factor', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
    expect(ratingAfter(1200, 1200, 1)).toBe(1216);
    expect(ratingAfter(1200, 1200, 0)).toBe(1184);
    expect(ratingAfter(1200, 1200, 0.5)).toBe(1200);
  });

  it('rewards upsets more', () => {
    expect(ratingAfter(1000, 1400, 1)).toBeGreaterThan(1025);
    expect(ratingAfter(1400, 1000, 1)).toBeLessThan(1407);
  });

  it('counts the result', () => {
    const stats = { wins: 1, losses: 2, draws: 3, rating: 1200 };
    expect(statsAfter(stats, 1200, 0.5)).toEqual({ wins: 1, losses: 2, draws: 4, rating: 1200 });
    expect(statsAfter(stats, 1200, 0)).toEqual({ wins: 1, losses: 3, draws: 3, rating: 1184 });
  });
});
