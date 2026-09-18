import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { REACTION_COOLDOWN_MS, REACTIONS, ReactionEmoji } from '../../core/game/reactions';
import { Icon } from '../../shared/ui/icon';

/** Keeps the tray clear of the screen edges. */
const EDGE = 12;
const PHONE = 640;

/**
 * The reaction button and its little tray of emoji.
 *
 * The tray opens as a popover, which puts it in the browser's top layer: the toolbar sits inside a
 * blurred panel, and a blur makes a containing block, so anything positioned inside it would be
 * pinned to the panel instead of the screen. The top layer also brings light dismiss and Escape.
 * On phones the tray docks above the tab bar, where a thumb can reach it.
 *
 * Sending is spaced out by the same cooldown the game rules enforce, so a tap that would be refused
 * is never offered.
 */
@Component({
  selector: 'app-reaction-picker',
  imports: [Icon],
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-ghost btn-sm size-10 p-0"
      aria-label="Send a reaction"
      [attr.aria-expanded]="open()"
      [title]="cooling() ? 'Wait a moment' : 'Send a reaction'"
      (click)="toggle()"
    >
      <app-icon name="smile" [size]="18" />
    </button>
    <div
      #tray
      class="tray"
      popover="auto"
      role="group"
      aria-label="Reactions"
      (beforetoggle)="open.set($any($event).newState === 'open')"
    >
      @for (reaction of reactions; track reaction.emoji) {
        <button
          type="button"
          class="emoji"
          [attr.aria-label]="reaction.label"
          [title]="reaction.label"
          [disabled]="cooling()"
          (click)="pick(reaction.emoji)"
        >
          {{ reaction.emoji }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    .tray {
      position: fixed;
      inset: auto;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.25rem;
      padding: 0.4rem;
      border: 1px solid var(--color-line);
      border-radius: 0.9rem;
      background: var(--color-panel-hi);
      box-shadow: 0 1.2rem 2rem rgb(0 0 0 / 0.45);
      overflow: visible;
    }
    /* Closed trays are display:none in the top layer; without :popover-open support they're hidden. */
    .tray:not(:popover-open) {
      display: none;
    }
    .tray:popover-open {
      display: grid;
      animation: tray-in 160ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes tray-in {
      from {
        opacity: 0;
        transform: scale(0.9) translateY(-0.4rem);
      }
    }
    .emoji {
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 0.7rem;
      font-size: 1.5rem;
      line-height: 1;
      transition:
        background-color 120ms,
        transform 120ms;
    }
    .emoji:hover:not(:disabled),
    .emoji:focus-visible {
      background: var(--color-void);
      transform: scale(1.12);
    }
    .emoji:disabled {
      opacity: 0.45;
    }
    /* Phones: a wide tray above the tab bar, with targets big enough for a thumb. */
    @media (width < 40rem) {
      .tray {
        gap: 0.4rem;
        padding: 0.6rem;
      }
      .tray:popover-open {
        animation-name: tray-up;
      }
      .emoji {
        width: 100%;
        height: 3.25rem;
        font-size: 1.75rem;
      }
    }
    @keyframes tray-up {
      from {
        opacity: 0;
        transform: translateY(0.75rem) scale(0.96);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tray:popover-open {
        animation: none;
      }
      .emoji {
        transition: none;
      }
      .emoji:hover:not(:disabled),
      .emoji:focus-visible {
        transform: none;
      }
    }
  `,
})
export class ReactionPicker {
  private readonly view = inject(ElementRef).nativeElement.ownerDocument.defaultView as Window;
  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');
  private readonly tray = viewChild.required<ElementRef<HTMLElement>>('tray');

  readonly picked = output<ReactionEmoji>();

  protected readonly reactions = REACTIONS;
  protected readonly open = signal(false);
  protected readonly cooling = signal(false);

  protected toggle(): void {
    const tray = this.tray().nativeElement;
    if (this.open()) {
      tray.hidePopover?.();
      this.open.set(false);
      return;
    }
    this.place(tray);
    if (tray.showPopover) {
      tray.showPopover();
    } else {
      // No popover support: show it anyway, placed the same way.
      tray.style.display = 'grid';
      this.open.set(true);
    }
  }

  /** Docks the tray above the tab bar on phones, or hangs it under the button on bigger screens. */
  private place(tray: HTMLElement): void {
    const width = this.view.innerWidth;
    if (width < PHONE) {
      Object.assign(tray.style, {
        left: `${EDGE}px`,
        right: `${EDGE}px`,
        top: 'auto',
        bottom: 'calc(4.75rem + env(safe-area-inset-bottom))',
        width: 'auto',
      });
      return;
    }
    const button = this.trigger().nativeElement.getBoundingClientRect();
    // Measure the tray before it's shown, so it can be nudged back inside the screen.
    tray.style.visibility = 'hidden';
    tray.style.display = 'grid';
    const trayWidth = tray.getBoundingClientRect().width;
    tray.style.removeProperty('display');
    tray.style.removeProperty('visibility');
    Object.assign(tray.style, {
      left: `${Math.min(Math.max(button.right - trayWidth, EDGE), width - EDGE - trayWidth)}px`,
      top: `${button.bottom + 8}px`,
      right: 'auto',
      bottom: 'auto',
      width: 'max-content',
    });
  }

  protected pick(emoji: ReactionEmoji): void {
    this.picked.emit(emoji);
    const tray = this.tray().nativeElement;
    tray.hidePopover?.();
    tray.style.removeProperty('display');
    this.open.set(false);
    this.cooling.set(true);
    setTimeout(() => this.cooling.set(false), REACTION_COOLDOWN_MS);
  }
}
