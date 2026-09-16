import { Component } from '@angular/core';

/** Stand-in for the chess board until gameplay ships. */
@Component({
  selector: 'app-board-placeholder',
  template: `
    <div
      class="board panel panel-gold relative mx-auto aspect-square w-full max-w-[520px] overflow-hidden p-3"
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
    .board-sweep {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        180deg,
        transparent 0%,
        rgb(34 240 255 / 0.14) 48%,
        rgb(34 240 255 / 0.3) 50%,
        transparent 52%
      );
      background-size: 100% 240%;
      animation: sweep 3.2s linear infinite;
      pointer-events: none;
    }
    @keyframes sweep {
      from {
        background-position: 0 120%;
      }
      to {
        background-position: 0 -120%;
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
