import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Room, RoomStatus } from '../../core/models';
import { RoomsService, roleIn } from '../../core/rooms/rooms.service';
import { burst } from '../../shared/fx/burst';
import { Avatar } from '../../shared/ui/avatar';
import { BoardPlaceholder } from '../../shared/ui/board-placeholder';
import { Icon } from '../../shared/ui/icon';
import { PlayerCard } from '../../shared/ui/player-card';
import { ToastService } from '../../shared/ui/toast.service';

const COUNTDOWN = ['3', '2', '1', 'GO'];

@Component({
  selector: 'app-room',
  imports: [RouterLink, Avatar, PlayerCard, BoardPlaceholder, Icon],
  templateUrl: './room.html',
  styles: `
    .countdown-step {
      animation: count-hit 760ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
    }
    @keyframes count-hit {
      from {
        opacity: 0;
        transform: scale(2.6);
      }
      45% {
        opacity: 1;
        transform: scale(0.95);
      }
      80% {
        opacity: 1;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(0.8);
      }
    }
  `,
})
export class RoomPage {
  private readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  readonly code = input.required<string>();

  protected readonly state = this.rooms.room(() => this.code());
  protected readonly room = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.room : null;
  });
  protected readonly role = computed(() => {
    const room = this.room();
    return room ? roleIn(room, this.auth.uid()) : null;
  });
  protected readonly seated = computed(() => this.role() === 'host' || this.role() === 'guest');
  protected readonly myReady = computed(() => {
    const room = this.room();
    return (
      !!room &&
      (this.role() === 'host' ? room.hostReady : this.role() === 'guest' ? room.guestReady : false)
    );
  });
  protected readonly opponent = computed(() => {
    const room = this.room();
    return this.role() === 'host' ? room?.guest : room?.host;
  });
  protected readonly readyHint = computed(() => {
    const room = this.room();
    if (!room) return '';
    const opponentReady = this.role() === 'host' ? room.guestReady : room.hostReady;
    const name = this.opponent()?.displayName ?? 'Your opponent';
    if (this.myReady() && !opponentReady) return `Waiting for ${name} to ready up.`;
    if (!this.myReady() && opponentReady) return `${name} is ready. Your move.`;
    return 'The match goes live when you both hit ready.';
  });
  protected readonly overMessage = computed(() => {
    const room = this.room();
    if (!room) return '';
    switch (room.status) {
      case 'cancelled':
        return room.endedBy === this.auth.uid()
          ? 'You closed this room.'
          : `${room.host.displayName} closed this room.`;
      case 'declined':
        return `${room.invited?.displayName ?? 'Your friend'} declined the challenge.`;
      default: {
        if (room.endedBy === this.auth.uid()) return 'You ended the match.';
        const name =
          room.endedBy === room.hostUid ? room.host.displayName : room.guest?.displayName;
        return `${name ?? 'Your opponent'} ended the match.`;
      }
    }
  });

  protected readonly countdown = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly leaveArmed = signal(false);
  protected readonly copied = signal<'code' | 'invite' | 'watch' | null>(null);

  private readonly vs = viewChild<ElementRef<HTMLElement>>('vs');
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout));

    // Spectators who open a live room link belong on the watch page.
    effect(() => {
      const room = this.room();
      if (room?.status === 'live' && !this.seated()) {
        untracked(() => this.router.navigate(['/watch', room.code], { replaceUrl: true }));
      }
    });

    // Celebrate the moments that happen while the page is open.
    let previous: { status: RoomStatus; guestUid: string | null } | null = null;
    effect(() => {
      const room = this.room();
      if (!room) return;
      if (previous) {
        if (previous.status === 'waiting' && room.status === 'live') {
          untracked(() => this.runCountdown());
        } else if (!previous.guestUid && room.guestUid && room.status === 'waiting') {
          this.later(() => burst(this.vs()?.nativeElement), 450);
        }
      }
      previous = { status: room.status, guestUid: room.guestUid };
    });
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private runCountdown(): void {
    COUNTDOWN.forEach((step, index) => this.later(() => this.countdown.set(step), index * 760));
    this.later(
      () => burst(this.document.body.querySelector('.countdown-step')),
      (COUNTDOWN.length - 1) * 760 + 100,
    );
    this.later(() => this.countdown.set(null), COUNTDOWN.length * 760);
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

  protected toggleReady(room: Room): void {
    void this.act(() => this.rooms.setReady(room.code, !this.myReady()));
  }

  protected join(room: Room): void {
    void this.act(() => this.rooms.join(room.code));
  }

  protected decline(room: Room): void {
    void this.act(async () => {
      await this.rooms.decline(room);
      await this.router.navigateByUrl('/play');
    });
  }

  protected leave(room: Room): void {
    if (room.status === 'live' && !this.leaveArmed()) {
      this.leaveArmed.set(true);
      this.later(() => this.leaveArmed.set(false), 3000);
      return;
    }
    const role = this.role();
    void this.act(async () => {
      await this.rooms.leave(room);
      if (role === 'guest' && room.status === 'waiting') {
        await this.router.navigateByUrl('/play');
      }
    });
  }

  protected async copy(kind: 'code' | 'invite' | 'watch', room: Room): Promise<void> {
    const origin = this.document.location.origin;
    const text = {
      code: room.code,
      invite: `${origin}/room/${room.code}`,
      watch: `${origin}/watch/${room.code}`,
    }[kind];
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(kind);
      this.later(() => this.copied.set(null), 1800);
    } catch {
      this.toasts.show({
        tone: 'error',
        title: "Couldn't copy. Select the text and copy it yourself.",
      });
    }
  }
}
