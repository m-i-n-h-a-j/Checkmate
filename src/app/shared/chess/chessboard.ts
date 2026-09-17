import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key, MoveMetadata } from 'chessground/types';
import type { Promotion } from '../../core/game/notation';
import { Side } from '../../core/models';

export interface BoardMove {
  from: string;
  to: string;
  promotion?: Promotion;
}

interface PendingPromotion {
  from: string;
  to: string;
  color: Side;
  /** Left edge of the promotion file, as a percentage of the board. */
  left: number;
  /** The picker grows up from the bottom edge when promoting toward the viewer. */
  fromBottom: boolean;
}

const PROMOTIONS: { symbol: Promotion; role: string; name: string }[] = [
  { symbol: 'q', role: 'queen', name: 'queen' },
  { symbol: 'n', role: 'knight', name: 'knight' },
  { symbol: 'r', role: 'rook', name: 'rook' },
  { symbol: 'b', role: 'bishop', name: 'bishop' },
];

/**
 * Chessground board. Chessground draws and animates the pieces itself, outside Angular's templates,
 * so change detection never touches the 64 squares. Inputs are pushed to it with `set()`.
 */
@Component({
  selector: 'app-chessboard',
  template: `
    <div #frame class="board-frame" [class.board-mini]="mini()">
      <div #board class="cg-wrap board-theme" aria-hidden="true"></div>
      @if (promotion(); as pick) {
        <div class="promotion-scrim" (click)="cancelPromotion()" aria-hidden="true"></div>
        <div
          class="promotion-picker"
          [class.from-bottom]="pick.fromBottom"
          [style.left.%]="pick.left"
          role="dialog"
          aria-label="Promote your pawn"
          (keydown.escape)="cancelPromotion()"
        >
          @for (piece of promotions; track piece.symbol; let first = $first) {
            <button
              type="button"
              class="promotion-choice"
              [attr.data-first]="first || null"
              [attr.aria-label]="'Promote to ' + piece.name"
              (click)="promote(piece.symbol)"
            >
              <span class="piece-icon" [class]="piece.role + ' ' + pick.color"></span>
            </button>
          }
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class Chessboard {
  readonly fen = input.required<string>();
  readonly orientation = input<Side>('white');
  readonly turn = input<Side>('white');
  readonly lastMove = input<readonly [string, string] | null>(null);
  readonly check = input(false);
  /** The side this viewer plays, or null to only watch. */
  readonly playable = input<Side | null>(null);
  readonly dests = input<ReadonlyMap<string, readonly string[]>>(new Map());
  /** Small, still board for match cards. */
  readonly mini = input(false);

  readonly moved = output<BoardMove>();

  protected readonly promotions = PROMOTIONS;
  protected readonly promotion = signal<PendingPromotion | null>(null);

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly board = viewChild.required<ElementRef<HTMLElement>>('board');
  private readonly document = inject(DOCUMENT);
  private readonly api = signal<Api | null>(null);
  private appliedFen: string | null = null;
  private appliedLastMove: string | null = null;

  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly config = computed<Config>(() => {
    const playable = this.playable();
    const myTurn = playable !== null && playable === this.turn();
    return {
      orientation: this.orientation(),
      turnColor: this.turn(),
      check: this.check(),
      viewOnly: playable === null,
      coordinates: !this.mini(),
      movable: {
        free: false,
        color: playable ?? undefined,
        dests: (myTurn ? this.dests() : new Map()) as Map<Key, Key[]>,
        showDests: true,
      },
      premovable: { enabled: playable !== null, showDests: true },
      draggable: { enabled: playable !== null, showGhost: true },
      selectable: { enabled: playable !== null },
      drawable: { enabled: !this.mini(), visible: !this.mini() },
      blockTouchScroll: playable !== null,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const frame = this.frame().nativeElement;
      const board = this.board().nativeElement;

      const api = Chessground(board, {
        ...this.config(),
        fen: this.fen(),
        lastMove: (this.lastMove() ?? undefined) as Key[] | undefined,
        disableContextMenu: true,
        addPieceZIndex: false,
        animation: { enabled: !this.reducedMotion, duration: this.mini() ? 180 : 200 },
        highlight: { lastMove: true, check: true },
        movable: {
          ...this.config().movable,
          events: { after: (orig, dest, meta) => this.afterMove(orig, dest, meta) },
        },
      });
      this.appliedFen = this.fen();
      this.appliedLastMove = this.lastMove()?.join('') ?? null;
      this.api.set(api);

      // Chessground measures the board with getBoundingClientRect, which includes transforms. If an
      // ancestor was mid entrance animation (say, scaling in), the squares come out too small and
      // no resize follows, so measure again once that animation ends.
      const remeasure = (event: Event) => {
        if (
          event.target instanceof Node &&
          event.target !== frame &&
          event.target.contains(frame)
        ) {
          api.redrawAll();
        }
      };
      this.document.addEventListener('animationend', remeasure);

      destroyRef.onDestroy(() => {
        this.document.removeEventListener('animationend', remeasure);
        api.destroy();
      });
    });

    effect(() => {
      const api = this.api();
      const config = this.config();
      const fen = this.fen();
      const lastMove = this.lastMove();
      if (!api) return;
      untracked(() => {
        const update: Config = { ...config };
        const lastMoveKey = lastMove?.join('') ?? null;
        const moved = fen !== this.appliedFen;
        if (moved) {
          update.fen = fen;
          this.appliedFen = fen;
          this.promotion.set(null);
        }
        if (moved || lastMoveKey !== this.appliedLastMove) {
          update.lastMove = (lastMove ?? undefined) as Key[] | undefined;
          this.appliedLastMove = lastMoveKey;
        }
        api.set(update);
        if (moved && config.movable?.color === config.turnColor) {
          api.playPremove();
        }
      });
    });
  }

  /** Puts the pieces back where the inputs say, e.g. after a move was refused. */
  reset(): void {
    const api = this.api();
    if (!api) return;
    this.promotion.set(null);
    api.set({
      ...this.config(),
      fen: this.fen(),
      lastMove: (this.lastMove() ?? undefined) as Key[] | undefined,
    });
  }

  protected promote(symbol: Promotion): void {
    const pick = this.promotion();
    if (!pick) return;
    this.promotion.set(null);
    this.moved.emit({ from: pick.from, to: pick.to, promotion: symbol });
  }

  protected cancelPromotion(): void {
    this.reset();
  }

  private afterMove(orig: Key, dest: Key, meta: MoveMetadata): void {
    const api = this.api();
    const piece = api?.state.pieces.get(dest);
    const lastRank = dest[1] === '8' || dest[1] === '1';
    if (!api || piece?.role !== 'pawn' || !lastRank) {
      this.moved.emit({ from: orig, to: dest });
      return;
    }
    if (meta.premove) {
      this.moved.emit({ from: orig, to: dest, promotion: 'q' });
      return;
    }
    const file = dest.charCodeAt(0) - 97;
    const column = this.orientation() === 'white' ? file : 7 - file;
    this.promotion.set({
      from: orig,
      to: dest,
      color: piece.color,
      left: column * 12.5,
      fromBottom: (dest[1] === '8') !== (this.orientation() === 'white'),
    });
    // Put keyboard focus on the first choice once the picker renders.
    requestAnimationFrame(() =>
      this.frame().nativeElement.querySelector<HTMLElement>('[data-first]')?.focus(),
    );
  }
}
