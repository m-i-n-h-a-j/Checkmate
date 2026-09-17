import { PlayerSnapshot } from '../models';

/** How hard a bot searches. Stockfish's own Elo limit only reaches down to 1320, so weaker bots mix in random moves. */
export interface EngineStrength {
  /** Stockfish "Skill Level", 0 to 20. */
  skill: number;
  /** Stockfish "UCI_Elo", 1320 to 3190. Overrides skill when set. */
  elo: number | null;
  depth: number | null;
  movetime: number;
  /** Chance of playing a random legal move instead of the engine's choice. */
  blunder: number;
}

export interface Bot {
  id: string;
  name: string;
  /** Rough playing strength, for the ladder. */
  rating: number;
  tagline: string;
  /** Neon accent for the bot's avatar and card. */
  color: string;
  strength: EngineStrength;
  /** How long the bot pretends to think, in ms, so its moves don't land instantly. */
  think: [number, number];
}

export const BOTS: readonly Bot[] = [
  {
    id: 'pawnbot',
    name: 'Pawnbot',
    rating: 250,
    tagline: 'Just found out the horsey moves in an L.',
    color: '#3dff9a',
    strength: { skill: 0, elo: null, depth: 1, movetime: 50, blunder: 0.45 },
    think: [500, 1100],
  },
  {
    id: 'rookie',
    name: 'Rookie',
    rating: 600,
    tagline: 'Trades pieces whenever it can. Any pieces.',
    color: '#22f0ff',
    strength: { skill: 0, elo: null, depth: 2, movetime: 100, blunder: 0.22 },
    think: [600, 1300],
  },
  {
    id: 'knightmare',
    name: 'Knightmare',
    rating: 900,
    tagline: 'Forks first, asks questions later.',
    color: '#b18cff',
    strength: { skill: 3, elo: null, depth: 4, movetime: 200, blunder: 0.1 },
    think: [700, 1500],
  },
  {
    id: 'bishop-blaze',
    name: 'Bishop Blaze',
    rating: 1200,
    tagline: 'Long diagonals, short temper.',
    color: '#ff8a3d',
    strength: { skill: 6, elo: null, depth: 6, movetime: 300, blunder: 0.04 },
    think: [700, 1600],
  },
  {
    id: 'castle-crusher',
    name: 'Castle Crusher',
    rating: 1500,
    tagline: 'Castles early. Attacks yours.',
    color: '#ff2e88',
    strength: { skill: 20, elo: 1500, depth: null, movetime: 400, blunder: 0 },
    think: [800, 1700],
  },
  {
    id: 'queen-bee',
    name: 'Queen Bee',
    rating: 1800,
    tagline: 'Stings from across the board.',
    color: '#ffc94a',
    strength: { skill: 20, elo: 1800, depth: null, movetime: 500, blunder: 0 },
    think: [800, 1800],
  },
  {
    id: 'gm-glitch',
    name: 'GM Glitch',
    rating: 2200,
    tagline: 'Calculates in the gaps between frames.',
    color: '#5b8cff',
    strength: { skill: 20, elo: 2200, depth: null, movetime: 700, blunder: 0 },
    think: [900, 1900],
  },
  {
    id: 'final-boss',
    name: 'The Final Boss',
    rating: 3000,
    tagline: 'No limits. No mercy. Good luck.',
    color: '#ff4d4d',
    strength: { skill: 20, elo: null, depth: null, movetime: 1200, blunder: 0 },
    think: [1200, 1200],
  },
];

export function botById(id: string | null | undefined): Bot | null {
  return BOTS.find((bot) => bot.id === id) ?? null;
}

/** The bot as a player, for player strips and cards. */
export function botPlayer(bot: Bot): PlayerSnapshot {
  return { uid: `bot:${bot.id}`, displayName: bot.name, username: null, photoURL: botAvatar(bot) };
}

const avatars = new Map<string, string>();

/** A pixel robot face in the bot's color, as an inline SVG data URL. */
export function botAvatar(bot: Bot): string {
  const cached = avatars.get(bot.id);
  if (cached) return cached;
  const index = BOTS.indexOf(bot);
  // Each bot gets its own eyes and mouth, picked by its place on the ladder.
  const eyes = [
    '<rect x="9" y="13" width="4" height="4"/><rect x="19" y="13" width="4" height="4"/>',
    '<rect x="8" y="14" width="6" height="2"/><rect x="18" y="14" width="6" height="2"/>',
    '<rect x="9" y="12" width="4" height="5"/><rect x="19" y="14" width="4" height="3"/>',
    '<rect x="8" y="13" width="16" height="4"/>',
  ][index % 4];
  const mouth = [
    '<rect x="11" y="21" width="10" height="2"/>',
    '<rect x="10" y="20" width="2" height="2"/><rect x="12" y="22" width="8" height="2"/><rect x="20" y="20" width="2" height="2"/>',
    '<rect x="12" y="21" width="8" height="3"/>',
    '<rect x="10" y="22" width="2" height="2"/><rect x="12" y="20" width="8" height="2"/><rect x="20" y="22" width="2" height="2"/>',
  ][Math.floor(index / 2) % 4];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">` +
    `<rect width="32" height="32" fill="#140b24"/>` +
    `<rect x="15" y="2" width="2" height="4" fill="${bot.color}"/><rect x="13" y="1" width="6" height="2" fill="${bot.color}"/>` +
    `<rect x="4" y="6" width="24" height="22" rx="3" fill="${bot.color}"/>` +
    `<rect x="2" y="13" width="2" height="7" fill="${bot.color}"/><rect x="28" y="13" width="2" height="7" fill="${bot.color}"/>` +
    `<g fill="#0a0612">${eyes}${mouth}</g></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  avatars.set(bot.id, url);
  return url;
}
