import { Component, input } from '@angular/core';
import { PlayerSnapshot } from '../../core/models';
import { Avatar } from './avatar';

/** One side of a VS screen. Shows an open seat when no player is seated. */
@Component({
  selector: 'app-player-card',
  imports: [Avatar],
  template: `
    <div
      class="panel flex h-full flex-col items-center justify-center gap-3 px-3 py-5 text-center sm:px-4 sm:py-6"
      [class.panel-cyan]="accent() === 'cyan' && player()"
      [class.panel-pink]="accent() === 'pink' && player()"
      [class.animate-slam-left]="player() && side() === 'left'"
      [class.animate-slam-right]="player() && side() === 'right'"
    >
      @if (player(); as p) {
        <app-avatar [name]="p.displayName" [photo]="p.photoURL" [size]="76" [ring]="accent()" />
        <div class="min-w-0 max-w-full">
          <p
            class="truncate font-body text-base font-bold sm:font-pixel sm:text-sm sm:font-normal"
            [class.text-neon-cyan]="accent() === 'cyan'"
            [class.text-neon-pink]="accent() === 'pink'"
          >
            {{ p.displayName }}
          </p>
          @if (p.username) {
            <p class="mt-1 truncate text-sm text-ink-dim">&#64;{{ p.username }}</p>
          }
          @if (caption()) {
            <p class="mt-1 text-sm text-ink-dim">{{ caption() }}</p>
          }
        </div>
        @if (ready() !== null) {
          <p
            class="pixel mt-1 rounded-md px-2.5 py-2 text-[9px] whitespace-nowrap sm:px-3 sm:text-[10px]"
            [class.bg-go]="ready()"
            [class.text-void-deep]="ready()"
            [class.text-ink-faint]="!ready()"
            [class.border]="!ready()"
            [class.border-line]="!ready()"
          >
            {{ ready() ? 'Ready' : 'Not ready' }}
          </p>
        }
      } @else {
        <span
          class="grid size-[76px] place-items-center rounded-[28%] border-2 border-dashed border-line text-3xl text-ink-faint"
          aria-hidden="true"
          >?</span
        >
        <p class="pixel animate-blink text-xs text-ink-faint">Open seat</p>
        @if (caption()) {
          <p class="text-sm text-ink-dim">{{ caption() }}</p>
        }
      }
    </div>
  `,
  host: { class: 'block min-w-0' },
})
export class PlayerCard {
  readonly player = input<PlayerSnapshot | null>(null);
  readonly side = input<'left' | 'right'>('left');
  readonly accent = input<'cyan' | 'pink'>('cyan');
  /** null hides the ready badge. */
  readonly ready = input<boolean | null>(null);
  readonly caption = input<string>('');
}
