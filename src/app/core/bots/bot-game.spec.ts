import {
  botFlagged,
  newBotGame,
  pauseBotGame,
  readBotClocks,
  resumeBotGame,
  withMove,
  withResult,
  withTakeback,
} from './bot-game';
import { BOTS, botAvatar, botById } from './bots';

const blitz = { initial: 180, increment: 2 };

describe('bot games', () => {
  it('deals colors', () => {
    expect(newBotGame('rookie', 'black', null, 0).playerColor).toBe('black');
    expect(newBotGame('rookie', 'random', null, 0, () => 0.9).playerColor).toBe('black');
    expect(newBotGame('rookie', 'random', null, 0, () => 0.1).playerColor).toBe('white');
  });

  it('keeps clocks still until both sides have moved', () => {
    let game = newBotGame('rookie', 'white', blitz, 0);
    game = withMove(game, 'e2e4', 5_000);
    expect(readBotClocks(game, 50_000)).toEqual({ white: 180_000, black: 180_000, running: null });
    game = withMove(game, 'e7e5', 60_000);
    expect(readBotClocks(game, 64_000)).toEqual({
      white: 176_000,
      black: 180_000,
      running: 'white',
    });
  });

  it('adds the increment after a move', () => {
    let game = newBotGame('rookie', 'white', blitz, 0);
    game = withMove(withMove(game, 'e2e4', 0), 'e7e5', 1_000);
    game = withMove(game, 'g1f3', 11_000);
    expect(game.whiteMs).toBe(172_000);
    expect(readBotClocks(game, 12_000)).toEqual({
      white: 172_000,
      black: 179_000,
      running: 'black',
    });
  });

  it('pauses and resumes without losing time', () => {
    let game = newBotGame('rookie', 'white', blitz, 0);
    game = withMove(withMove(game, 'e2e4', 0), 'e7e5', 0);
    game = pauseBotGame(game, 30_000);
    expect(readBotClocks(game, 900_000).white).toBe(150_000);
    game = resumeBotGame(game, 900_000);
    expect(readBotClocks(game, 910_000).white).toBe(140_000);
  });

  it('flags a side that runs out', () => {
    let game = newBotGame('rookie', 'white', { initial: 60, increment: 0 }, 0);
    game = withMove(withMove(game, 'e2e4', 0), 'e7e5', 0);
    expect(botFlagged(game, 59_999)).toBeNull();
    expect(botFlagged(game, 60_000)).toBe('white');
    expect(botFlagged(newBotGame('rookie', 'white', null, 0), 1e9)).toBeNull();
  });

  it('takes moves back', () => {
    let game = newBotGame('rookie', 'white', null, 0);
    game = withMove(withMove(withMove(game, 'e2e4', 0), 'e7e5', 0), 'g1f3', 0);
    game = withTakeback(game, 2, 0);
    expect(game.moves).toEqual(['e2e4']);
    expect(game.takebacks).toBe(1);
    expect(withTakeback(game, 5, 0).moves).toEqual([]);
  });

  it('stops the clocks when the game ends', () => {
    let game = newBotGame('rookie', 'white', blitz, 0);
    game = withMove(withMove(game, 'e2e4', 0), 'e7e5', 0);
    game = withResult(game, 'black', 'resign', 20_000);
    expect(game.status).toBe('finished');
    expect(readBotClocks(game, 99_000)).toEqual({ white: 160_000, black: 180_000, running: null });
  });
});

describe('bot roster', () => {
  it('climbs in strength and has unique ids', () => {
    const ratings = BOTS.map((bot) => bot.rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
    expect(new Set(BOTS.map((bot) => bot.id)).size).toBe(BOTS.length);
    for (const bot of BOTS) {
      const { elo, skill, blunder } = bot.strength;
      expect(elo === null || (elo >= 1320 && elo <= 3190)).toBe(true);
      expect(skill >= 0 && skill <= 20 && blunder >= 0 && blunder < 1).toBe(true);
    }
  });

  it('draws an avatar for every bot', () => {
    const bot = botById('queen-bee');
    expect(bot).not.toBeNull();
    expect(botAvatar(bot!)).toMatch(/^data:image\/svg\+xml,/);
    expect(botById('nobody')).toBeNull();
  });
});
