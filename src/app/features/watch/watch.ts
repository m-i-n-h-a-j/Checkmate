import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { RoomsService, roleIn } from '../../core/rooms/rooms.service';
import { clock } from '../../core/util/time';
import { BoardPlaceholder } from '../../shared/ui/board-placeholder';
import { PlayerCard } from '../../shared/ui/player-card';

@Component({
  selector: 'app-watch',
  imports: [RouterLink, PlayerCard, BoardPlaceholder],
  templateUrl: './watch.html',
})
export class Watch {
  private readonly auth = inject(AuthService);
  readonly code = input.required<string>();

  protected readonly state = inject(RoomsService).room(() => this.code());
  protected readonly room = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.room : null;
  });
  protected readonly isPlayer = computed(() => {
    const room = this.room();
    const role = room ? roleIn(room, this.auth.uid()) : 'visitor';
    return role === 'host' || role === 'guest';
  });

  private readonly now = signal(Date.now());
  protected readonly elapsed = computed(() => {
    const started = this.room()?.startedAt?.toMillis();
    return started ? clock(started, this.now()) : '0:00';
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
