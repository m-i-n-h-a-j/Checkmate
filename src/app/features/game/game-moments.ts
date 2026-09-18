import { DOCUMENT, DestroyRef, inject, signal } from '@angular/core';
import { MusicService } from '../../core/audio/music.service';
import { Position } from '../../core/game/chess-game';
import { opposite } from '../../core/game/notation';
import { SoundService } from '../../core/game/sound.service';
import { GameEndReason, GameResult, Side } from '../../core/models';
import { burst } from '../../shared/fx/burst';
import { BoardFx, Finale, Subject } from './board-fx';

export interface MomentsState {
  plies: number;
  status: 'live' | 'finished';
  position: Position;
  result: GameResult | null;
  reason: GameEndReason | null;
}

export interface MomentsOptions {
  fx: () => BoardFx | undefined;
  nameOf: (side: Side) => string;
  /** The side the viewer plays, or null for spectators. */
  mySide: () => Side | null;
  /** Where the win confetti bursts from. */
  resultSelector: string;
  /** Caption the viewer's own side in second person, when `nameOf` calls them "You". */
  secondPerson?: boolean;
}

/**
 * The show around a game: move sounds, capture, promotion and check effects, the ending cinematic,
 * screen reader announcements, and when the result card appears. Shared by online and bot games.
 * Only changes seen while the page is open get effects, never a position loaded with the page.
 * Must be created in an injection context.
 */
export class GameMoments {
  private readonly sounds = inject(SoundService);
  private readonly music = inject(MusicService);
  private readonly document = inject(DOCUMENT);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private previous: { plies: number; status: MomentsState['status'] } | null = null;
  private soundedPlies = -1;

  readonly showResult = signal(false);
  /** True while the ending cinematic plays, so no result card spoils it. */
  readonly revealing = signal(false);
  readonly focusResult = signal(false);
  readonly announcement = signal('');

  constructor(private readonly options: MomentsOptions) {
    inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout));
  }

  /** Call whenever the game changes, outside reactive tracking. */
  follow(state: MomentsState): void {
    const { plies, position, status } = state;
    const previous = this.previous;
    const justEnded = status === 'finished' && previous?.status === 'live';

    if (previous && plies < previous.plies) {
      // A takeback: nothing to celebrate, and the next move is new again.
      this.soundedPlies = -1;
      this.announcement.set('Move taken back');
    } else if (previous && plies > previous.plies) {
      const san = position.history.at(-1) ?? '';
      const capture = position.lastCapture;
      if (plies !== this.soundedPlies) this.playMoveSound(san, capture?.piece ?? null);
      const mover = this.options.nameOf(plies % 2 === 1 ? 'white' : 'black');
      this.announcement.set(`${mover} played ${san}`);
      if (plies === previous.plies + 1) {
        const fx = this.options.fx();
        const promotion = position.lastPromotion;
        if (capture) {
          const quiet = justEnded || !!promotion;
          fx?.capture(capture, this.subject(opposite(capture.color)), quiet);
        }
        if (promotion) {
          const shown = fx?.promotion(
            promotion.square,
            promotion.piece,
            promotion.color,
            this.subject(promotion.color),
            justEnded,
          );
          if (shown) this.sounds.play('promote');
        }
        if (!justEnded && position.check && position.kingSquare) {
          fx?.check(position.kingSquare);
        }
      }
    }

    if (justEnded) {
      this.endGame(state);
    } else if (status === 'finished' && !previous) {
      this.showResult.set(true);
    } else if (status === 'live') {
      this.showResult.set(false);
      this.revealing.set(false);
    }
    this.previous = { plies, status };
  }

  /** Plays a move's sound right away for the player who made it, before the game state catches up. */
  playedLocally(plies: number, san: string, captured: string | null): void {
    this.soundedPlies = plies;
    this.playMoveSound(san, captured);
  }

  /** Forgets the last state, e.g. when a different game starts in the same view. */
  reset(): void {
    this.music.stop();
    this.timers.forEach(clearTimeout);
    this.timers.length = 0;
    this.previous = null;
    this.soundedPlies = -1;
    this.showResult.set(false);
    this.revealing.set(false);
    this.focusResult.set(false);
  }

  private subject(side: Side): Subject {
    const you = !!this.options.secondPerson && side === this.options.mySide();
    return { name: this.options.nameOf(side), you };
  }

  private playMoveSound(san: string, captured: string | null): void {
    if (captured === 'q' || captured === 'r') {
      this.sounds.play('shatter');
    } else {
      this.sounds.play(/[+#]/.test(san) ? 'check' : captured ? 'capture' : 'move');
    }
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  /** Plays the ending cinematic, then reveals the result. */
  private endGame(state: MomentsState): void {
    const finale = this.finaleOf(state);
    this.playEndingMusic(state.result);
    if (finale) this.announcement.set(`Game over. ${finale.subtitle}.`);
    const duration = finale ? (this.options.fx()?.finale(finale.kind, finale) ?? 0) : 0;
    this.revealing.set(duration > 0);
    if (duration > 0) {
      if (finale?.kind === 'checkmate') this.later(() => this.sounds.play('boom'), 1050);
      if (finale?.kind === 'stalemate' || finale?.kind === 'draw') this.sounds.play('freeze');
      if (finale?.kind === 'timeout' || finale?.kind === 'resign') {
        this.later(() => this.sounds.play('boom'), 420);
      }
    }
    this.later(() => {
      this.revealing.set(false);
      this.showResult.set(true);
      this.focusResult.set(this.options.mySide() !== null);
      this.celebrate(state.result);
    }, duration);
  }

  /** A decisive game gets its sting; draws and aborted games just stop the music. */
  private playEndingMusic(result: GameResult | null): void {
    const side = this.options.mySide();
    if (result === 'white' || result === 'black') {
      this.music.play(!side || result === side ? 'win' : 'loss');
    } else {
      this.music.stop();
    }
  }

  private finaleOf(
    state: MomentsState,
  ): { kind: Finale; subtitle: string; kingSquare: string | null; loser: Side } | null {
    const { position, result, reason } = state;
    const winner = this.subject(opposite(position.turn));
    const loser = this.subject(result === 'white' ? 'black' : 'white');
    const base = { kingSquare: position.kingSquare, loser: position.turn };
    switch (reason) {
      case 'checkmate':
        return {
          ...base,
          kind: 'checkmate',
          subtitle: `${winner.name} ${winner.you ? 'win' : 'wins'}`,
        };
      case 'stalemate':
        return { ...base, kind: 'stalemate', subtitle: 'No legal moves. It’s a draw.' };
      case 'resign':
        return {
          ...base,
          kind: 'resign',
          subtitle: `${loser.name} ${loser.you ? 'resign' : 'resigns'}`,
        };
      case 'timeout':
        return result === 'draw'
          ? { ...base, kind: 'draw', subtitle: 'Time ran out against a lone king' }
          : { ...base, kind: 'timeout', subtitle: `${loser.name} ran out of time` };
      case 'threefold':
        return { ...base, kind: 'draw', subtitle: 'Threefold repetition' };
      case 'insufficient':
        return { ...base, kind: 'draw', subtitle: 'Not enough pieces left to mate' };
      case 'fifty':
        return { ...base, kind: 'draw', subtitle: 'Fifty-move rule' };
      case 'agreement':
        return { ...base, kind: 'draw', subtitle: 'Draw agreed' };
      default:
        return null;
    }
  }

  private celebrate(result: GameResult | null): void {
    const side = this.options.mySide();
    if (result === null || result === 'aborted') return;
    if (result === 'draw') {
      this.sounds.play('draw');
    } else if (!side || result === side) {
      this.sounds.play('win');
      if (side) {
        this.later(() => burst(this.document.querySelector(this.options.resultSelector)), 60);
      }
    } else {
      this.sounds.play('lose');
    }
  }
}
