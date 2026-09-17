import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { GameService } from '../../core/game/game.service';
import { Room } from '../../core/models';
import { ToastService } from '../../shared/ui/toast.service';

type Armed = 'resign' | 'abort' | null;

/** Draw offers, resigning and aborting for a seated player in a live game. */
@Component({
  selector: 'app-game-controls',
  template: `
    @if (offerFromOpponent()) {
      <div class="panel panel-gold animate-pop-in mb-3 p-3" role="status">
        <p class="font-semibold">{{ opponentName() }} offers a draw</p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            [disabled]="busy()"
            (click)="run(declineDraw)"
          >
            Decline
          </button>
          <button
            type="button"
            class="btn btn-gold btn-sm"
            [disabled]="busy()"
            (click)="run(acceptDraw)"
          >
            Accept draw
          </button>
        </div>
      </div>
    }

    <div class="grid grid-cols-2 gap-2">
      @if (room().moves.length < 2) {
        <button
          type="button"
          class="btn btn-danger btn-sm col-span-2"
          [disabled]="busy()"
          (click)="confirm('abort')"
        >
          {{ armed() === 'abort' ? 'Tap again to abort' : 'Abort game' }}
        </button>
      } @else {
        @if (myOffer()) {
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            [disabled]="busy()"
            (click)="run(withdrawDraw)"
          >
            Cancel offer
          </button>
        } @else {
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            [disabled]="busy() || offerFromOpponent()"
            (click)="run(offerDraw)"
          >
            Offer draw
          </button>
        }
        <button
          type="button"
          class="btn btn-danger btn-sm"
          [disabled]="busy()"
          (click)="confirm('resign')"
        >
          {{ armed() === 'resign' ? 'Tap to confirm' : 'Resign' }}
        </button>
      }
    </div>
    <p class="sr-only" aria-live="polite">
      @if (armed() === 'resign') {
        Press resign again to confirm.
      } @else if (armed() === 'abort') {
        Press abort again to confirm.
      }
    </p>
  `,
  host: { class: 'block' },
})
export class GameControls {
  private readonly auth = inject(AuthService);
  private readonly games = inject(GameService);
  private readonly toasts = inject(ToastService);

  readonly room = input.required<Room>();
  readonly opponentName = input('Your opponent');

  protected readonly busy = signal(false);
  protected readonly armed = signal<Armed>(null);
  protected readonly myOffer = computed(() => this.room().drawOffer === this.auth.uid());
  protected readonly offerFromOpponent = computed(() => {
    const offer = this.room().drawOffer;
    return offer !== null && offer !== this.auth.uid();
  });

  private disarmTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.disarmTimer));
  }

  protected readonly offerDraw = () => this.games.offerDraw(this.room());
  protected readonly withdrawDraw = () => this.games.clearDrawOffer(this.room());
  protected readonly declineDraw = () => this.games.clearDrawOffer(this.room());
  protected readonly acceptDraw = () => this.games.acceptDraw(this.room());

  protected confirm(action: Exclude<Armed, null>): void {
    if (this.armed() !== action) {
      this.armed.set(action);
      clearTimeout(this.disarmTimer);
      this.disarmTimer = setTimeout(() => this.armed.set(null), 3000);
      return;
    }
    this.armed.set(null);
    void this.run(() =>
      action === 'resign' ? this.games.resign(this.room()) : this.games.abort(this.room()),
    );
  }

  protected async run(action: () => Promise<unknown>): Promise<void> {
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
