import { Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-avatar',
  template: `
    <span
      class="relative grid shrink-0 place-items-center rounded-[28%] border-2 bg-panel-hi"
      [class.border-line]="ring() === 'none'"
      [class.border-neon-cyan]="ring() === 'cyan'"
      [class.border-neon-pink]="ring() === 'pink'"
      [class.border-gold]="ring() === 'gold'"
      [style.width.px]="size()"
      [style.height.px]="size()"
    >
      @if (photo() && !failed()) {
        <img
          class="size-full rounded-[24%] object-cover"
          [src]="photo()"
          alt=""
          [width]="size()"
          [height]="size()"
          referrerpolicy="no-referrer"
          loading="lazy"
          (error)="failed.set(true)"
        />
      } @else {
        <span class="pixel text-gold" [style.font-size.px]="size() * 0.3" aria-hidden="true">{{
          initials()
        }}</span>
      }
      @if (online() !== null) {
        <span
          class="absolute -right-1 -bottom-1 rounded-full border-2 border-void"
          [class.bg-go]="online()"
          [class.bg-ink-faint]="!online()"
          [style.width.px]="dot()"
          [style.height.px]="dot()"
          [style.box-shadow]="online() ? '0 0 10px #3dff9a' : 'none'"
        ></span>
      }
    </span>
  `,
  host: { class: 'inline-block' },
})
export class Avatar {
  readonly name = input.required<string>();
  readonly photo = input<string | null>(null);
  readonly size = input(40);
  /** null hides the presence dot. */
  readonly online = input<boolean | null>(null);
  readonly ring = input<'none' | 'cyan' | 'pink' | 'gold'>('none');

  protected readonly failed = signal(false);
  protected readonly dot = computed(() => Math.max(10, Math.round(this.size() * 0.26)));
  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    const letters =
      parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  });
}
