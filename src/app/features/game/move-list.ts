import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  viewChild,
} from '@angular/core';

/** The game's moves in pairs. A single scrolling row on phones, a numbered table beside the board. */
@Component({
  selector: 'app-move-list',
  template: `
    <div
      #scroller
      class="move-scroller min-h-0 overflow-auto overscroll-contain rounded-xl border border-line bg-void/60"
      tabindex="0"
      role="region"
      aria-label="Moves"
    >
      @if (pairs().length) {
        <ol class="move-grid text-sm">
          @for (pair of pairs(); track $index; let last = $last) {
            <li class="move-row">
              <span class="move-number text-ink-faint">{{ $index + 1 }}.</span>
              <span class="move" [class.move-latest]="last && !pair.black">{{ pair.white }}</span>
              @if (pair.black) {
                <span class="move" [class.move-latest]="last">{{ pair.black }}</span>
              }
            </li>
          }
        </ol>
      } @else {
        <p class="px-3 py-3 text-sm text-ink-dim">No moves yet</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .move-grid {
      display: flex;
      gap: 0.25rem;
      padding: 0.35rem;
      white-space: nowrap;
    }
    .move-row {
      display: flex;
      align-items: baseline;
      gap: 0.15rem;
    }
    .move-number {
      padding-left: 0.35rem;
      font-variant-numeric: tabular-nums;
    }
    .move {
      padding: 0.2rem 0.4rem;
      border-radius: 6px;
      font-weight: 600;
    }
    .move-latest {
      background: rgb(255 201 74 / 0.18);
      color: var(--color-gold);
    }
    @media (min-width: 1024px) {
      .move-scroller {
        flex: 1;
      }
      .move-grid {
        display: grid;
        gap: 0;
        padding: 0.35rem 0;
      }
      .move-row {
        display: grid;
        grid-template-columns: 2.75rem 1fr 1fr;
        padding: 0.05rem 0.35rem;
      }
      .move-row:nth-child(even) {
        background: rgb(255 255 255 / 0.03);
      }
    }
  `,
})
export class MoveList {
  readonly history = input.required<readonly string[]>();

  protected readonly pairs = computed(() => {
    const history = this.history();
    const pairs: { white: string; black: string | null }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({ white: history[i], black: history[i + 1] ?? null });
    }
    return pairs;
  });

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Keep the latest move in view as the game goes on.
    afterRenderEffect(() => {
      this.pairs();
      const element = this.scroller().nativeElement;
      element.scrollTo({ top: element.scrollHeight, left: element.scrollWidth });
    });
  }
}
