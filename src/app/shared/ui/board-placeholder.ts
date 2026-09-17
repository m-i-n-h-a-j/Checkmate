import { Component } from '@angular/core';

/** Stand-in for the chess board until gameplay ships. */
@Component({
  selector: 'app-board-placeholder',
  template: `
    <div
      class="board panel panel-gold relative mx-auto aspect-square w-full max-w-130 overflow-hidden p-3"
    >
      <div
        class="grid size-full grid-cols-8 grid-rows-8 overflow-hidden rounded-lg border border-gold/30"
        aria-hidden="true"
      >
        @for (square of squares; track square) {
          <span [class]="isDark(square) ? 'bg-panel' : 'bg-panel-hi'"></span>
        }
      </div>
      <div class="board-sweep" aria-hidden="true"></div>
      <div class="absolute inset-0 grid place-items-center p-8 text-center">
        <p class="panel px-5 py-4">
          <span class="pixel block text-xs text-gold glow-gold">Board loading</span>
          <span class="mt-2 block text-sm text-ink-dim"
            >Moves arrive in the next update. The match is live for spectators already.</span
          >
        </p>
      </div>
    </div>
  `,
  styles: `
    /*
     * A scan line and its trail, moved by transform so the board never repaints. It crosses in the
     * first two thirds of the loop and waits below the clipped edge, so the restart is never seen.
     */
    .board-sweep {
      position: absolute;
      inset: 0 0 auto;
      height: 124.8%;
      background: linear-gradient(
        180deg,
        transparent,
        rgb(34 240 255 / 0.14) 92.3%,
        rgb(34 240 255 / 0.3) 96.2%,
        transparent
      );
      transform: translateY(-100%);
      animation: sweep 3.2s linear infinite;
      pointer-events: none;
    }
    @keyframes sweep {
      67%,
      to {
        transform: translateY(80.2%);
      }
    }
  `,
})
export class BoardPlaceholder {
  protected readonly squares = Array.from({ length: 64 }, (_, i) => i);

  protected isDark(square: number): boolean {
    return (Math.floor(square / 8) + (square % 8)) % 2 === 1;
  }
}
