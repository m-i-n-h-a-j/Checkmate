import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Room, Side } from '../../core/models';
import { RoomsService } from '../../core/rooms/rooms.service';
import { ToastService } from '../../shared/ui/toast.service';

/** The result of a finished game, and the way into a rematch. */
@Component({
  selector: 'app-game-over',
  imports: [RouterLink],
  template: `
    <div
      class="panel panel-gold animate-pop-in w-full max-w-sm p-5 text-center sm:p-6"
      role="group"
      aria-labelledby="game-result"
    >
      <h2
        #heading
        id="game-result"
        tabindex="-1"
        class="pixel text-lg outline-none sm:text-xl"
        [class.text-gold]="tone() === 'win'"
        [class.glow-gold]="tone() === 'win'"
        [class.text-neon-pink]="tone() === 'lose'"
        [class.glow-pink]="tone() === 'lose'"
        [class.text-neon-cyan]="tone() === 'even'"
        [class.glow-cyan]="tone() === 'even'"
      >
        {{ headline() }}
      </h2>
      <p class="mt-3 text-ink-dim">{{ detail() }}</p>
      @if (myRatingDiff() !== null) {
        <p class="mt-2 font-semibold">
          Rating
          <span
            [class.text-go]="myRatingDiff()! > 0"
            [class.text-neon-pink]="myRatingDiff()! < 0"
            >{{ signed(myRatingDiff()!) }}</span
          >
        </p>
      }

      <div class="mt-5 flex flex-col gap-2">
        @if (mySide()) {
          @switch (rematchView()) {
            @case ('offer') {
              <button
                type="button"
                class="btn btn-pink"
                [disabled]="busy()"
                (click)="offerRematch()"
              >
                {{ busy() ? 'Setting up…' : 'Rematch' }}
              </button>
            }
            @case ('incoming') {
              <p class="font-semibold text-gold" role="status">
                {{ opponentName() }} wants a rematch
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  [disabled]="busy()"
                  (click)="declineRematch()"
                >
                  Decline
                </button>
                <button
                  type="button"
                  class="btn btn-pink btn-sm"
                  [disabled]="busy()"
                  (click)="acceptRematch()"
                >
                  Accept
                </button>
              </div>
            }
            @case ('sent') {
              <a [routerLink]="['/room', room().rematch]" class="btn btn-gold"
                >Go to rematch room</a
              >
            }
            @case ('declined') {
              <p class="text-ink-dim" role="status">No rematch this time.</p>
            }
            @case ('live') {
              <a [routerLink]="['/room', room().rematch]" class="btn btn-pink">Play the rematch</a>
            }
          }
          <a routerLink="/play" class="btn btn-ghost btn-sm">Back to Play</a>
        } @else {
          @if (rematch()?.status === 'live') {
            <a [routerLink]="['/watch', room().rematch]" class="btn btn-pink">Watch the rematch</a>
          }
          <a routerLink="/" fragment="live" class="btn btn-cyan btn-sm">Find another match</a>
        }
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
export class GameOver {
  private readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly room = input.required<Room>();
  /** The viewer's side when they played this game. */
  readonly mySide = input<Side | null>(null);
  readonly whiteName = input('White');
  readonly blackName = input('Black');
  readonly dismissible = input(false);
  /** Move focus to the result, for the players who just finished. */
  readonly focusResult = input(false);
  readonly dismissed = output();

  protected readonly busy = signal(false);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  private readonly rematchState = this.rooms.room(() => this.room().rematch ?? '');
  protected readonly rematch = computed(() => {
    const state = this.rematchState();
    return state.status === 'ready' ? state.room : null;
  });

  protected readonly opponentName = computed(() =>
    this.mySide() === 'white' ? this.blackName() : this.whiteName(),
  );

  protected readonly tone = computed<'win' | 'lose' | 'even'>(() => {
    const result = this.room().result;
    const side = this.mySide();
    if (result === 'white' || result === 'black') {
      return side && result !== side ? 'lose' : 'win';
    }
    return 'even';
  });

  protected readonly headline = computed(() => {
    const { result } = this.room();
    const side = this.mySide();
    if (result === 'aborted') return 'Game aborted';
    if (result === 'draw') return 'Draw';
    if (side) return result === side ? 'You win!' : 'You lose';
    return `${result === 'white' ? this.whiteName() : this.blackName()} wins`;
  });

  protected readonly detail = computed(() => {
    const room = this.room();
    const loser = room.result === 'white' ? this.blackName() : this.whiteName();
    const flagged = room.moves.length % 2 === 0 ? this.whiteName() : this.blackName();
    switch (room.reason) {
      case 'checkmate':
        return 'Checkmate.';
      case 'resign':
        return `${loser} resigned.`;
      case 'timeout':
        return room.result === 'draw'
          ? `${flagged} ran out of time against a lone king.`
          : `${loser} ran out of time.`;
      case 'stalemate':
        return 'Stalemate. No legal moves, but no check.';
      case 'insufficient':
        return 'Neither side has enough pieces left to checkmate.';
      case 'threefold':
        return 'The same position came up three times.';
      case 'fifty':
        return 'Fifty moves without a capture or a pawn move.';
      case 'agreement':
        return 'Both players agreed to a draw.';
      case 'aborted': {
        const by = room.endedBy === room.whiteUid ? this.whiteName() : this.blackName();
        return `${by} aborted before both players had moved.`;
      }
      default:
        return 'The game is over.';
    }
  });

  protected readonly myRatingDiff = computed(() => {
    const room = this.room();
    const side = this.mySide();
    if (!side) return null;
    return side === 'white' ? room.whiteRatingDiff : room.blackRatingDiff;
  });

  protected readonly rematchView = computed(() => {
    const room = this.room();
    const rematch = this.rematch();
    if (!room.rematch) return 'offer';
    if (!rematch) return null;
    if (rematch.status === 'live') return 'live';
    if (rematch.status !== 'waiting') return 'declined';
    return rematch.hostUid === this.auth.uid() ? 'sent' : 'incoming';
  });

  constructor() {
    afterNextRender(() => {
      if (this.focusResult()) {
        this.heading().nativeElement.focus({ preventScroll: true });
      }
    });

    // A player still looking at this result follows the rematch once it starts.
    effect(() => {
      const rematch = this.rematch();
      const uid = this.auth.uid();
      if (
        rematch?.status === 'live' &&
        this.mySide() &&
        (rematch.hostUid === uid || rematch.guestUid === uid)
      ) {
        untracked(() => this.router.navigate(['/room', rematch.code]));
      }
    });
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0';
  }

  protected offerRematch(): void {
    void this.act(async () => {
      const code = await this.rooms.offerRematch(this.room());
      await this.router.navigate(['/room', code]);
    });
  }

  protected acceptRematch(): void {
    const code = this.room().rematch;
    if (!code) return;
    void this.act(async () => {
      await this.rooms.join(code);
      await this.router.navigate(['/room', code]);
      await this.rooms.setReady(code, true);
    });
  }

  protected declineRematch(): void {
    const rematch = this.rematch();
    if (!rematch) return;
    void this.act(() => this.rooms.decline(rematch));
  }

  private async act(action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.toasts.error(error);
    } finally {
      this.busy.set(false);
    }
  }
}
