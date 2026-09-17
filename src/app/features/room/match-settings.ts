import { Component, computed, inject, input } from '@angular/core';
import {
  TIME_CONTROLS,
  TimeControlOption,
  sameTimeControl,
  timeControlOption,
} from '../../core/game/time-controls';
import { HostColor, Room } from '../../core/models';
import { RoomsService } from '../../core/rooms/rooms.service';
import { ToastService } from '../../shared/ui/toast.service';

const COLORS: { value: HostColor; label: string; icon: string }[] = [
  { value: 'white', label: 'White', icon: '♔' },
  { value: 'random', label: 'Random', icon: '?' },
  { value: 'black', label: 'Black', icon: '♚' },
];

/** The host picks the clock and their color while the room waits. Everyone else sees the choice. */
@Component({
  selector: 'app-match-settings',
  template: `
    @if (editable()) {
      <div class="grid gap-5">
        <fieldset>
          <legend class="mb-2 font-semibold">Clock</legend>
          <div class="grid grid-cols-3 gap-2 md:grid-cols-6">
            @for (option of timeControls; track option.label) {
              <label class="tile" [class.tile-on]="isTime(option)">
                <input
                  type="radio"
                  name="time-control"
                  class="sr-only"
                  [checked]="isTime(option)"
                  (change)="save({ timeControl: option })"
                />
                <span class="pixel text-[10px]">{{ option.label }}</span>
                <span class="text-xs text-ink-dim">{{ option.speed }}</span>
              </label>
            }
          </div>
        </fieldset>
        <fieldset>
          <legend class="mb-2 font-semibold">You play</legend>
          <div class="grid grid-cols-3 gap-2">
            @for (color of colors; track color.value) {
              <label class="tile" [class.tile-on]="room().hostColor === color.value">
                <input
                  type="radio"
                  name="host-color"
                  class="sr-only"
                  [checked]="room().hostColor === color.value"
                  (change)="save({ hostColor: color.value })"
                />
                <span class="text-2xl leading-none" aria-hidden="true">{{ color.icon }}</span>
                <span class="text-sm font-semibold">{{ color.label }}</span>
              </label>
            }
          </div>
        </fieldset>
        <p class="text-sm text-ink-dim" aria-live="polite">{{ note() }}</p>
      </div>
    } @else {
      <p class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-ink-dim">
        <span class="pixel text-xs text-gold">{{ time().label }}</span>
        <span>{{ time().speed }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ colorSummary() }}</span>
      </p>
    }
  `,
  styles: `
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      min-height: 3.75rem;
      padding: 0.5rem 0.25rem;
      border: 2px solid var(--color-line);
      border-radius: 10px;
      background: rgb(10 6 18 / 0.6);
      cursor: pointer;
      transition:
        border-color 120ms,
        background-color 120ms;
    }
    .tile:hover {
      border-color: rgb(34 240 255 / 0.6);
    }
    .tile-on {
      border-color: var(--color-gold);
      background: rgb(255 201 74 / 0.12);
      color: var(--color-gold);
    }
    .tile:has(input:focus-visible) {
      outline: 2px solid var(--color-neon-cyan);
      outline-offset: 3px;
    }
  `,
  host: { class: 'block' },
})
export class MatchSettings {
  private readonly rooms = inject(RoomsService);
  private readonly toasts = inject(ToastService);

  readonly room = input.required<Room>();
  readonly editable = input(false);

  protected readonly timeControls = TIME_CONTROLS;
  protected readonly colors = COLORS;

  protected readonly time = computed(() => timeControlOption(this.room().timeControl));
  protected readonly colorSummary = computed(() => {
    const room = this.room();
    const host = room.host.displayName;
    return room.hostColor === 'random'
      ? 'Colors are random'
      : `${host} plays ${room.hostColor === 'white' ? 'White' : 'Black'}`;
  });
  protected readonly note = computed(() =>
    this.room().guestUid ? 'Changing a setting asks both players to ready up again.' : '',
  );

  protected isTime(option: TimeControlOption): boolean {
    return sameTimeControl(option, this.room().timeControl);
  }

  /** Saves right away. The local write shows instantly, so quick changes in a row all land. */
  protected save(change: { timeControl?: TimeControlOption; hostColor?: HostColor }): void {
    const room = this.room();
    this.rooms
      .updateSettings(room, {
        timeControl: change.timeControl
          ? { initial: change.timeControl.initial, increment: change.timeControl.increment }
          : room.timeControl,
        hostColor: change.hostColor ?? room.hostColor,
      })
      .catch((error: unknown) => this.toasts.error(error));
  }
}
