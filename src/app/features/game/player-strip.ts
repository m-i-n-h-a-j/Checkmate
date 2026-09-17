import { Component, computed, inject, input } from '@angular/core';
import { PieceSymbol } from 'chess.js';
import { formatClock } from '../../core/game/clock';
import { PlayerSnapshot, Side, UserProfile } from '../../core/models';
import { PresenceService } from '../../core/presence/presence.service';
import { Avatar } from '../../shared/ui/avatar';

const ROLE: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const LOW_TIME_MS = 20_000;

/** One player's row beside the board: who they are, material edge and their clock. */
@Component({
  selector: 'app-player-strip',
  imports: [Avatar],
  template: `
    <div
      class="flex min-h-14 items-center gap-3 rounded-xl border px-2.5 py-2 transition-colors sm:px-3"
      [class.border-gold]="running()"
      [class.bg-panel-hi]="running()"
      [class.border-line]="!running()"
      [class.bg-void]="!running()"
    >
      <app-avatar
        [name]="player()?.displayName ?? '?'"
        [photo]="player()?.photoURL ?? null"
        [size]="40"
        [online]="profile() ? presence.isOnline(profile()) : null"
        [ring]="side() === 'white' ? 'cyan' : 'pink'"
      />
      <div class="min-w-0 flex-1">
        <p class="flex min-w-0 items-baseline gap-2">
          <span class="truncate font-semibold">{{ player()?.displayName ?? 'Open seat' }}</span>
          @if (you()) {
            <span class="shrink-0 text-xs text-ink-dim">(you)</span>
          }
        </p>
        <p class="flex min-h-5 items-center gap-2 text-sm text-ink-dim">
          <span class="sr-only">Plays {{ side() }}.</span>
          @if (profile(); as p) {
            <span>{{ p.stats.rating }}</span>
          }
          @if (ratingDiff() !== null) {
            <span
              class="font-semibold"
              [class.text-go]="ratingDiff()! > 0"
              [class.text-neon-pink]="ratingDiff()! < 0"
              >{{ ratingDiff()! > 0 ? '+' : ratingDiff()! < 0 ? '−' : '±' }}{{ absDiff() }}</span
            >
          }
          @if (pieces().length) {
            <span class="flex items-center" role="img" [attr.aria-label]="materialLabel()">
              @for (piece of pieces(); track $index) {
                <span
                  class="piece-icon material-piece -mr-2 size-5 shrink-0"
                  [class]="piece + ' ' + (side() === 'white' ? 'black' : 'white')"
                ></span>
              }
              @if (lead() > 0) {
                <span class="ml-3 text-xs">+{{ lead() }}</span>
              }
            </span>
          }
        </p>
      </div>
      @if (clockMs() !== null) {
        <div
          class="clock pixel shrink-0 rounded-lg px-2.5 py-2 text-sm tabular-nums sm:text-base"
          [class.clock-running]="running()"
          [class.clock-low]="low()"
          role="timer"
          [attr.aria-label]="(player()?.displayName ?? side()) + ' clock, ' + time()"
        >
          {{ time() }}
        </div>
      }
    </div>
  `,
  styles: `
    /* Dark pieces get a light rim so they read on the midnight strip. */
    .material-piece.black {
      filter: drop-shadow(0 0 1px rgb(236 230 255 / 0.9));
    }
    .clock {
      position: relative;
      min-width: 5.75rem;
      text-align: right;
      color: var(--color-ink-dim);
      background: var(--color-void-deep);
    }
    .clock-running {
      color: var(--color-void-deep);
      background: var(--color-gold);
    }
    .clock-low {
      color: #fff;
      background: #c0145f;
    }
    /* Low-time pulse on an overlay so it animates opacity only. */
    .clock-low.clock-running::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: 0 0 18px 2px rgb(255 46 136 / 0.9);
      animation: low-pulse 500ms ease-in-out infinite alternate;
    }
    @keyframes low-pulse {
      to {
        opacity: 0.15;
      }
    }
  `,
  host: { class: 'block' },
})
export class PlayerStrip {
  protected readonly presence = inject(PresenceService);

  readonly side = input.required<Side>();
  readonly player = input<PlayerSnapshot | null>(null);
  readonly profile = input<UserProfile | null>(null);
  readonly you = input(false);
  /** Time left, or null to hide the clock. */
  readonly clockMs = input<number | null>(null);
  readonly running = input(false);
  /** Captured-material edge this side holds, as piece symbols. */
  readonly imbalance = input<readonly PieceSymbol[]>([]);
  /** Material lead in pawns, when this side is ahead. */
  readonly lead = input(0);
  readonly ratingDiff = input<number | null>(null);

  protected readonly time = computed(() => formatClock(this.clockMs() ?? 0));
  protected readonly low = computed(() => (this.clockMs() ?? Infinity) < LOW_TIME_MS);
  protected readonly absDiff = computed(() => Math.abs(this.ratingDiff() ?? 0));
  protected readonly pieces = computed(() => this.imbalance().map((piece) => ROLE[piece]));
  protected readonly materialLabel = computed(() => {
    const lead = this.lead();
    return lead > 0 ? `Up ${lead} in material` : 'Material captured';
  });
}
