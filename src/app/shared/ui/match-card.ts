import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { parseUci } from '../../core/game/notation';
import { PlayerSnapshot, Room } from '../../core/models';
import { PresenceService } from '../../core/presence/presence.service';
import { timeAgo } from '../../core/util/time';
import { Chessboard } from '../chess/chessboard';
import { Avatar } from './avatar';

@Component({
  selector: 'app-match-card',
  imports: [RouterLink, Avatar, Chessboard],
  template: `
    <a
      [routerLink]="['/watch', room().code]"
      class="match-card panel group block p-5 transition-[border-color,box-shadow] duration-200 hover:border-neon-cyan/60 hover:shadow-[0_0_30px_-10px_rgb(34_240_255/0.6)]"
    >
      <div class="flex items-center justify-between gap-3 text-sm">
        <span class="flex items-center gap-2 font-semibold text-neon-pink"
          ><span class="live-dot"></span> Live</span
        >
        <span class="text-ink-dim">Started {{ started() }}</span>
      </div>
      <app-chessboard
        class="pointer-events-none mt-4"
        [fen]="room().fen"
        [lastMove]="lastMove()"
        [mini]="true"
      />
      <div class="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <app-avatar
            [name]="white().displayName"
            [photo]="white().photoURL"
            [size]="36"
            ring="cyan"
          />
          <span class="min-w-0 truncate font-semibold">{{ white().displayName }}</span>
        </div>
        <span class="pixel text-xs text-gold glow-gold">VS</span>
        <div class="flex min-w-0 flex-row-reverse items-center gap-2 text-right">
          <app-avatar
            [name]="black().displayName"
            [photo]="black().photoURL"
            [size]="36"
            ring="pink"
          />
          <span class="min-w-0 truncate font-semibold">{{ black().displayName }}</span>
        </div>
      </div>
      <p class="mt-5 text-center text-sm text-ink-dim transition-colors group-hover:text-neon-cyan">
        Watch this match
      </p>
    </a>
  `,
  host: { class: 'block' },
})
export class MatchCard {
  private readonly presence = inject(PresenceService);
  readonly room = input.required<Room>();

  /** White on the left, as the board is drawn from White's side. */
  protected readonly white = computed(() => this.seat(this.room().whiteUid ?? this.room().hostUid));
  protected readonly black = computed(() =>
    this.seat(this.room().blackUid ?? this.room().guestUid ?? ''),
  );
  protected readonly lastMove = computed(() => {
    const last = parseUci(this.room().moves.at(-1) ?? '');
    return last ? ([last.from, last.to] as const) : null;
  });

  private seat(uid: string): PlayerSnapshot {
    const room = this.room();
    const player = uid === room.hostUid ? room.host : room.guest;
    return player ?? { uid, displayName: 'Open seat', username: null, photoURL: null };
  }

  protected readonly started = computed(() => {
    const at = this.room().startedAt?.toMillis();
    return at ? timeAgo(at, this.presence.now()) : 'just now';
  });
}
