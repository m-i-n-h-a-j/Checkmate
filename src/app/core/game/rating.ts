import { PlayerStats } from '../models';

/** Elo K-factor. Mirrors firestore.rules. */
export const RATING_K = 32;

export type Score = 0 | 0.5 | 1;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export function ratingAfter(rating: number, opponentRating: number, score: Score): number {
  return Math.round(rating + RATING_K * (score - expectedScore(rating, opponentRating)));
}

export function statsAfter(stats: PlayerStats, opponentRating: number, score: Score): PlayerStats {
  return {
    wins: stats.wins + (score === 1 ? 1 : 0),
    losses: stats.losses + (score === 0 ? 1 : 0),
    draws: stats.draws + (score === 0.5 ? 1 : 0),
    rating: ratingAfter(stats.rating, opponentRating, score),
  };
}
