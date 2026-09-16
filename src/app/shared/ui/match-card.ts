import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Room } from '../../core/models';
import { PresenceService } from '../../core/presence/presence.service';
import { timeAgo } from '../../core/util/time';
import { Avatar } from './avatar';

@Component({
  selector: 'app-match-card',
  imports: [RouterLink, Avatar],
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
      <div class="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div class="flex min-w-0 flex-col items-center gap-2 text-center">
          <app-avatar
            [name]="room().host.displayName"
            [photo]="room().host.photoURL"
            [size]="56"
            ring="cyan"
          />
          <span class="w-full truncate font-semibold">{{ room().host.displayName }}</span>
        </div>
        <span class="pixel text-sm text-gold glow-gold">VS</span>
        <div class="flex min-w-0 flex-col items-center gap-2 text-center">
          <app-avatar
            [name]="room().guest?.displayName ?? '?'"
            [photo]="room().guest?.photoURL ?? null"
            [size]="56"
            ring="pink"
          />
          <span class="w-full truncate font-semibold">{{ room().guest?.displayName }}</span>
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

  protected readonly started = computed(() => {
    const at = this.room().startedAt?.toMillis();
    return at ? timeAgo(at, this.presence.now()) : 'just now';
  });
}
