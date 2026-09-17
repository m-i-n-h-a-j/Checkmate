import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BotGame } from '../../core/bots/bot-game';
import { Bot } from '../../core/bots/bots';

/** The end of a bot game: the result, and what to play next. */
@Component({
  selector: 'app-bot-result',
  imports: [RouterLink],
  template: `
    <div
      class="panel panel-gold animate-pop-in w-full max-w-sm p-5 text-center sm:p-6"
      role="group"
      aria-labelledby="bot-result"
    >
      <h2
        #heading
        id="bot-result"
        tabindex="-1"
        class="pixel text-lg outline-none sm:text-xl"
        [class.text-gold]="outcome() === 'win'"
        [class.glow-gold]="outcome() === 'win'"
        [class.text-neon-pink]="outcome() === 'loss'"
        [class.glow-pink]="outcome() === 'loss'"
        [class.text-neon-cyan]="outcome() === 'draw'"
        [class.glow-cyan]="outcome() === 'draw'"
      >
        {{ headline() }}
      </h2>
      <p class="mt-3 text-ink-dim">{{ detail() }}</p>
      @if (firstWin() && nextBot(); as next) {
        <p class="mt-2 font-semibold text-gold">
          First win against {{ bot().name }}! {{ next.name }} is up next.
        </p>
      } @else if (firstWin()) {
        <p class="mt-2 font-semibold text-gold">You beat the whole ladder!</p>
      }

      <div class="mt-5 flex flex-col gap-2">
        @if (outcome() === 'win' && nextBot(); as next) {
          <button type="button" class="btn btn-gold" (click)="playNext.emit(next)">
            Play {{ next.name }}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" (click)="again.emit()">
            Play again
          </button>
        } @else {
          <button type="button" class="btn btn-pink" (click)="again.emit()">
            {{ outcome() === 'loss' ? 'Try again' : 'Play again' }}
          </button>
        }
        <a routerLink="/bots" class="btn btn-ghost btn-sm">Pick another bot</a>
        @if (dismissible()) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="dismissed.emit()">
            View the board
          </button>
        }
      </div>
    </div>
  `,
  host: { class: 'flex w-full justify-center' },
})
export class BotResult {
  readonly game = input.required<BotGame>();
  readonly bot = input.required<Bot>();
  readonly nextBot = input<Bot | null>(null);
  /** True when this game was the player's first win against this bot. */
  readonly firstWin = input(false);
  readonly dismissible = input(false);
  readonly focusResult = input(false);

  readonly again = output();
  readonly playNext = output<Bot>();
  readonly dismissed = output();

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly outcome = computed<'win' | 'loss' | 'draw'>(() => {
    const { result, playerColor } = this.game();
    return result === 'draw' ? 'draw' : result === playerColor ? 'win' : 'loss';
  });

  protected readonly headline = computed(() => {
    switch (this.outcome()) {
      case 'win':
        return 'You win!';
      case 'loss':
        return 'You lose';
      default:
        return 'Draw';
    }
  });

  protected readonly detail = computed(() => {
    const game = this.game();
    const bot = this.bot().name;
    const loser = this.outcome() === 'win' ? bot : 'You';
    switch (game.reason) {
      case 'checkmate':
        return this.outcome() === 'win' ? `You checkmated ${bot}.` : `${bot} checkmated you.`;
      case 'resign':
        return 'You resigned.';
      case 'timeout':
        return game.result === 'draw'
          ? 'Time ran out against a lone king.'
          : loser === 'You'
            ? 'You ran out of time.'
            : `${bot} ran out of time.`;
      case 'stalemate':
        return 'Stalemate. No legal moves, but no check.';
      case 'insufficient':
        return 'Neither side has enough pieces left to checkmate.';
      case 'threefold':
        return 'The same position came up three times.';
      case 'fifty':
        return 'Fifty moves without a capture or a pawn move.';
      default:
        return 'The game is over.';
    }
  });

  constructor() {
    afterNextRender(() => {
      if (this.focusResult()) this.heading().nativeElement.focus({ preventScroll: true });
    });
  }
}
