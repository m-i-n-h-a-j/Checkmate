import { Component, DOCUMENT, DestroyRef, ElementRef, inject } from '@angular/core';
import { EffectsService } from '../../core/settings/effects.service';

/** Kept clear of the sticky header and the screen edges, whatever the layout. */
const EDGE = 16;
const HEADER = 72;
const FLOAT_PX = 130;

/**
 * Reactions popping up over the player who sent them. The emoji springs out of that player's strip,
 * drifts up and fades, with a glow behind it. Everything animates on transform and opacity only, so
 * it stays on the compositor.
 *
 * Positions are measured from the strip at spawn time, which is what keeps it right on every screen:
 * the strips move with the layout, and the pop follows them.
 */
@Component({
  selector: 'app-reaction-fx',
  template: '',
  host: { class: 'reaction-fx', 'aria-hidden': 'true' },
})
export class ReactionFx {
  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly effects = inject(EffectsService);
  private readonly prefersReducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.host.textContent = ''));
  }

  /** Which way the next pop travels: 1 down, -1 up. */
  private away = -1;

  private get reducedMotion(): boolean {
    return this.prefersReducedMotion || !this.effects.full();
  }

  /** Pops an emoji over `anchor`, or over the middle of the screen if there's nothing to anchor to. */
  show(emoji: string, anchor: Element | null): void {
    const view = this.document.defaultView;
    if (!view) return;
    const box = anchor?.getBoundingClientRect();
    const width = view.innerWidth;
    const x = box ? Math.min(Math.max(box.left + box.width / 2, EDGE), width - EDGE) : width / 2;
    const y = box
      ? Math.min(Math.max(box.top + box.height / 2, HEADER), view.innerHeight - EDGE)
      : view.innerHeight / 2;

    // A pop over the top player drifts down into the board; one over the bottom player drifts up.
    this.away = y < view.innerHeight / 2 ? 1 : -1;

    const pop = this.document.createElement('div');
    pop.className = 'reaction-pop';
    pop.textContent = emoji;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;

    const glow = this.document.createElement('div');
    glow.className = 'reaction-glow';
    glow.style.left = `${x}px`;
    glow.style.top = `${y}px`;

    this.host.append(glow, pop);
    this.play(pop, glow);
  }

  private play(pop: HTMLElement, glow: HTMLElement): void {
    const quiet = this.reducedMotion;
    const done = () => {
      pop.remove();
      glow.remove();
    };

    if (quiet) {
      // Light effects and reduced motion still show who reacted, just without the flight.
      pop.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 1, offset: 0.75 },
          { opacity: 0 },
        ],
        {
          duration: 1600,
          easing: 'ease-out',
        },
      ).onfinish = done;
      glow.remove();
      return;
    }

    // A little sideways drift so two reactions in a row don't trace the same line.
    const drift = (Math.random() * 2 - 1) * 26;
    const tilt = (Math.random() * 2 - 1) * 10;
    // Float towards the middle of the screen: away from the header above and the tab bar below.
    const rise = FLOAT_PX * this.away;
    const duration = 2400;
    // The spring belongs to the movement. Fading on the same curve would leave the emoji
    // see-through for most of its flight, so opacity runs on its own even timeline.
    pop.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2) rotate(-14deg)', offset: 0 },
        { transform: 'translate(-50%, -50%) scale(1.3) rotate(6deg)', offset: 0.16 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', offset: 0.3 },
        {
          transform: `translate(calc(-50% + ${drift}px), calc(-50% + ${rise * 0.6}px)) scale(1.04) rotate(${tilt}deg)`,
          offset: 0.72,
        },
        {
          transform: `translate(calc(-50% + ${drift * 1.5}px), calc(-50% + ${rise}px)) scale(0.88) rotate(${tilt * 1.4}deg)`,
          offset: 1,
        },
      ],
      { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    ).onfinish = done;

    pop.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.06 },
        { opacity: 1, offset: 0.76 },
        { opacity: 0, offset: 1 },
      ],
      { duration, easing: 'linear' },
    );

    glow.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.4)', opacity: 0.55, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(2.4)', opacity: 0 },
      ],
      { duration: 950, easing: 'ease-out' },
    );
  }
}
