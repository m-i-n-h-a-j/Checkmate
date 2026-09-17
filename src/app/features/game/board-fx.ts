import { Component, DOCUMENT, DestroyRef, ElementRef, inject, input } from '@angular/core';
import type { PieceSymbol } from 'chess.js';
import type { Capture } from '../../core/game/chess-game';
import { EffectsService } from '../../core/settings/effects.service';
import { Side } from '../../core/models';

export type Finale = 'checkmate' | 'stalemate' | 'draw' | 'timeout' | 'resign';

/** Who did something, for captions. `you` switches to second person ("You take the queen"). */
export interface Subject {
  name: string;
  you: boolean;
}

type Tone = 'gold' | 'pink' | 'ice';

const ROLE: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const POINTS: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CALLOUT: Partial<Record<PieceSymbol, { title: string; noun: string }>> = {
  q: { title: 'QUEEN DOWN!', noun: 'the queen' },
  r: { title: 'TOWER FALLS!', noun: 'a rook' },
};
const PROMOTED: Partial<Record<PieceSymbol, string>> = {
  q: 'QUEENED!',
  n: 'KNIGHTED!',
  r: 'PROMOTED!',
  b: 'PROMOTED!',
};
const SHARDS: Record<Side | 'gold' | 'pink' | 'ice', [string, string, string]> = {
  white: ['#ffffff', '#e2d9ff', '#9d8cc9'],
  black: ['#6b5a8c', '#2b2140', '#0b0714'],
  gold: ['#fff4d1', '#ffc94a', '#a86f10'],
  pink: ['#ffd6e8', '#ff2e88', '#8f0d49'],
  ice: ['#ffffff', '#a8f6ff', '#22a0b8'],
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * 3D moments over the board: shattering captures, a pawn crowned on the last rank, a toppled king
 * on checkmate, a frozen board on stalemate.
 *
 * Built for integrated graphics: elements are created only when their part of the effect starts,
 * a frame after the move lands, so rasterizing them never piles onto the move itself. Every
 * element gets one Web Animation that touches only transform and opacity, and is removed when it
 * ends. Nothing plays for viewers who prefer reduced motion; results are still announced in text.
 */
@Component({
  selector: 'app-board-fx',
  template: '',
  host: { class: 'board-fx', 'aria-hidden': 'true' },
})
export class BoardFx {
  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly effects = inject(EffectsService);
  private readonly prefersReducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  readonly orientation = input<Side>('white');

  /** Board width, kept current by a ResizeObserver so effects never force a layout. */
  private width = 0;

  constructor() {
    const observer = new ResizeObserver(([entry]) => (this.width = entry.contentRect.width));
    observer.observe(this.host);
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      this.timers.forEach(clearTimeout);
    });
  }

  /** Heavy effects are off by the player's choice or their system's reduced motion setting. */
  private get reducedMotion(): boolean {
    return this.prefersReducedMotion || !this.effects.full();
  }

  /** Effect for a captured piece. Returns how long it runs, in ms. */
  capture(capture: Capture, capturer: Subject, quiet = false): number {
    if (this.reducedMotion || capture.piece === 'p' || capture.piece === 'k') return 0;
    const major = capture.piece === 'q' || capture.piece === 'r';
    this.later(() => {
      const { x, y, size } = this.square(capture.square);
      this.ghost(capture.square, ROLE[capture.piece], capture.color);
      this.ring(x, y, size, major ? 3.2 : 2.2);
      this.shatter(x, y, size, capture.color, major ? 16 : 10, major ? 1.25 : 0.85);
      if (major) this.shake(size * 0.12);
    });
    this.later(() => {
      const { x, y, size } = this.square(capture.square);
      this.points(x, y, size, POINTS[capture.piece]);
    }, 120);
    const callout = CALLOUT[capture.piece];
    if (callout && !quiet) {
      this.later(() => this.title(callout.title, 'gold', 1600), 80);
      const takes = `${capturer.name} ${capturer.you ? 'take' : 'takes'} ${callout.noun}`;
      this.later(() => this.subtitle(takes, 1400), 240);
    }
    return major ? 1700 : 1100;
  }

  /** A pawn reaching the last rank: a pillar of light, the pawn spins away and the new piece lands. */
  promotion(
    square: string,
    piece: PieceSymbol,
    color: Side,
    mover: Subject,
    quiet = false,
  ): number {
    if (this.reducedMotion) return 0;
    const duration = 1500;
    this.later(() => {
      const { x, y, size } = this.square(square);
      this.pillar(x, y, size, duration);
      this.spinOut(x, y, size, color);
      this.sparks(x, y, size, 10);
    });
    this.later(() => {
      const { x, y, size } = this.square(square);
      // Chessground has drawn the new piece by now. Hide it while its double lands on top.
      const real = this.realPiece(square);
      if (real) real.style.opacity = '0';
      const landing = this.landing(x, y, size, ROLE[piece], color, duration - 380);
      const restore = () => {
        if (real) real.style.opacity = '';
      };
      landing.finished.then(restore, restore);
    }, 380);
    this.later(() => {
      const { x, y, size } = this.square(square);
      this.ring(x, y, size, 2.6);
      this.shatter(x, y, size, 'gold', 10, 0.9, true);
    }, 820);
    if (!quiet) {
      const noun = ROLE[piece];
      this.later(() => this.title(PROMOTED[piece] ?? 'PROMOTED!', 'gold', 1500), 300);
      const whose = mover.you ? 'Your' : `${mover.name}'s`;
      this.later(() => this.subtitle(`${whose} pawn becomes a ${noun}`, 1300), 520);
    }
    return duration;
  }

  /** A quick stamp over a king in check. */
  check(kingSquare: string): number {
    if (this.reducedMotion) return 0;
    this.later(() => {
      const { x, y, size } = this.square(kingSquare);
      const stamp = this.spawn('fx-stamp fx-pink', {
        left: `${x}px`,
        top: `${Math.max(size * 0.4, y - size * 0.72)}px`,
        fontSize: `${Math.max(10, size * 0.3)}px`,
      });
      stamp.textContent = 'CHECK!';
      this.animate(
        stamp,
        [
          {
            transform: 'translate(-50%, -50%) translateZ(160px) rotateZ(-18deg) scale(2.4)',
            opacity: 0,
          },
          {
            transform: 'translate(-50%, -50%) translateZ(0) rotateZ(-6deg) scale(1)',
            opacity: 1,
            offset: 0.16,
            easing: 'cubic-bezier(.2,1.6,.4,1)',
          },
          {
            transform: 'translate(-50%, -50%) translateZ(0) rotateZ(-4deg) scale(1)',
            opacity: 1,
            offset: 0.7,
          },
          {
            transform: 'translate(-50%, -140%) translateZ(40px) rotateZ(-2deg) scale(0.9)',
            opacity: 0,
          },
        ],
        900,
      );
    });
    return 900;
  }

  /** The end-of-game cinematic. Returns how long to wait before showing the result card. */
  finale(
    kind: Finale,
    options: { subtitle: string; kingSquare?: string | null; loser?: Side | null },
  ): number {
    if (this.reducedMotion) return 0;
    switch (kind) {
      case 'checkmate':
        return this.checkmate(options.subtitle, options.kingSquare ?? null, options.loser ?? null);
      case 'stalemate':
        return this.frozen('STALEMATE', options.subtitle, 22);
      case 'draw':
        return this.frozen('DRAW', options.subtitle, 10);
      case 'timeout':
        return this.slam('TIME UP!', options.subtitle);
      case 'resign':
        return this.slam('K.O.', options.subtitle);
    }
  }

  private checkmate(subtitle: string, kingSquare: string | null, loser: Side | null): number {
    this.later(() => this.flash('fx-flash', 520));

    if (kingSquare && loser) {
      this.later(() => {
        const real = this.realPiece(kingSquare);
        if (real) real.style.opacity = '0';
        const topple = this.ghost(kingSquare, 'king', loser, 'topple');
        const restore = () => {
          if (real) real.style.opacity = '';
        };
        topple.finished.then(restore, restore);
      });
      // The king hits the board.
      this.later(() => {
        const { x, y, size } = this.square(kingSquare);
        this.ring(x, y, size, 4);
        this.shatter(x, y + size * 0.25, size, loser, 14, 1.1);
        this.shake(size * 0.16);
      }, 1050);
      this.later(() => {
        const { x, y, size } = this.square(kingSquare);
        this.shatter(x, y + size * 0.25, size, 'gold', 6, 1.4, true);
      }, 1100);
    }

    this.later(() => this.rays(2700), 500);
    this.later(() => this.crown(2600), 700);
    this.later(() => this.word('CHECKMATE', 'gold', 'drop', 1000), 650);
    this.later(() => this.subtitle(subtitle, 1700, this.width * 0.1), 1450);
    return 3300;
  }

  /** Letters thrown in from all around, frost over the board, pixel snow. */
  private frozen(text: string, subtitle: string, flakes: number): number {
    this.later(() => this.flash('fx-frost', 3000));
    this.later(() => this.snow(Math.ceil(flakes / 2)), 16);
    this.later(() => this.snow(Math.floor(flakes / 2)), 400);
    this.later(() => this.word(text, 'ice', 'assemble', 1200), 250);
    this.later(() => this.subtitle(subtitle, 1800, this.width * 0.09), 1200);
    return 3100;
  }

  /** Fighting-game style: the word slams into the screen and the board shakes. */
  private slam(text: string, subtitle: string): number {
    this.later(() => this.flash('fx-dim', 2600));
    this.later(() => this.word(text, 'pink', 'slam', 900), 150);
    this.later(() => this.shake(this.width * 0.02), 420);
    this.later(() => this.subtitle(subtitle, 1600, this.width * 0.09), 900);
    return 2600;
  }

  // ---------- building blocks ----------

  /** 1 to float up, -1 to float down: whichever keeps a bit of text over the board's middle. */
  private inward(y: number): number {
    return y < this.width * 0.3 ? -1 : 1;
  }

  private square(square: string): { x: number; y: number; size: number } {
    const size = this.width / 8;
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    const white = this.orientation() === 'white';
    const col = white ? file : 7 - file;
    const row = white ? 8 - rank : rank - 1;
    return { x: (col + 0.5) * size, y: (row + 0.5) * size, size };
  }

  /** Chessground's own piece element on a square. */
  private realPiece(square: string): HTMLElement | null {
    const board = this.host.parentElement?.querySelector('cg-board');
    const pieces = board ? Array.from(board.querySelectorAll<HTMLElement>('piece')) : [];
    return (
      pieces.find((piece) => (piece as HTMLElement & { cgKey?: string }).cgKey === square) ?? null
    );
  }

  private spawn(className: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
    const element = this.document.createElement('div');
    element.className = className;
    Object.assign(element.style, style);
    this.host.append(element);
    return element;
  }

  private animate(
    element: HTMLElement,
    keyframes: Keyframe[],
    duration: number,
    easing = 'linear',
  ): Animation {
    const animation = element.animate(keyframes, { duration, easing, fill: 'both' });
    const remove = () => element.remove();
    animation.finished.then(remove, remove);
    return animation;
  }

  /**
   * Runs part of an effect after a delay, always in an animation frame. Even "now" waits one frame
   * so the effect never lands in the same frame as the move that caused it.
   */
  private later(fn: () => void, ms = 0): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      requestAnimationFrame(() => {
        if (this.host.isConnected && this.width > 0) fn();
      });
    }, ms);
    this.timers.add(timer);
  }

  /** A copy of the piece that leaps off the board and tumbles away, or topples over. */
  private ghost(
    square: string,
    role: string,
    color: Side,
    motion: 'tumble' | 'topple' = 'tumble',
  ): Animation {
    const { x, y, size } = this.square(square);
    const ghost = this.spawn(`fx-ghost piece-icon ${role} ${color}`, {
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
    if (motion === 'topple') {
      const down = (dy: number, rx: number, rz: number, extra = '') =>
        `translate3d(${-size * 0.35}px, ${size * dy}px, 40px) rotateX(${rx}deg) rotateZ(${rz}deg)${extra}`;
      return this.animate(
        ghost,
        [
          { transform: 'translate3d(0, 0, 0) rotateX(0deg) rotateZ(0deg)' },
          { transform: 'translate3d(0, 0, 10px) rotateX(0deg) rotateZ(-9deg)', offset: 0.08 },
          { transform: 'translate3d(0, 0, 10px) rotateX(0deg) rotateZ(8deg)', offset: 0.15 },
          {
            transform: 'translate3d(0, 0, 20px) rotateX(0deg) rotateZ(-4deg)',
            offset: 0.21,
            easing: 'cubic-bezier(.55,0,1,.45)',
          },
          { transform: down(0.08, -18, -92), offset: 0.33 },
          { transform: down(0.02, -12, -84), offset: 0.37 },
          { transform: down(0.08, -18, -90), opacity: 1, offset: 0.44 },
          { transform: down(0.08, -18, -90), opacity: 1, offset: 0.92 },
          { transform: down(0.3, -30, -90, ' scale(0.9)'), opacity: 0 },
        ],
        3300,
      );
    }
    const direction = pick([-1, 1]);
    return this.animate(
      ghost,
      [
        {
          transform: 'translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) scale(1)',
          opacity: 1,
          easing: 'cubic-bezier(.15,.7,.3,1)',
        },
        {
          transform: `translate3d(${direction * size * 0.4}px, ${-size * 1.2}px, ${size * 2.4}px) rotateX(-30deg) rotateY(${direction * 220}deg) scale(1.3)`,
          opacity: 1,
          offset: 0.42,
          easing: 'cubic-bezier(.5,0,.9,.5)',
        },
        {
          transform: `translate3d(${direction * size * 1.1}px, ${size * 1.6}px, ${-size}px) rotateX(80deg) rotateY(${direction * 460}deg) scale(0.7)`,
          opacity: 0,
        },
      ],
      1050,
    );
  }

  /** The promoting pawn spins up out of its square and fades. */
  private spinOut(x: number, y: number, size: number, color: Side): void {
    const pawn = this.spawn(`fx-ghost piece-icon pawn ${color}`, {
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
    this.animate(
      pawn,
      [
        { transform: 'translate3d(0, 0, 0) rotateY(0deg) scale(1)', opacity: 1 },
        {
          transform: `translate3d(0, ${-size * 0.35}px, ${size * 0.8}px) rotateY(540deg) scale(1.1)`,
          opacity: 1,
          offset: 0.7,
          easing: 'cubic-bezier(.5,0,1,.6)',
        },
        {
          transform: `translate3d(0, ${-size * 0.9}px, ${size * 1.6}px) rotateY(900deg) scale(0.3)`,
          opacity: 0,
        },
      ],
      520,
      'cubic-bezier(.3,0,.7,1)',
    );
  }

  /** The new piece drops out of the light with a spin and a bounce. */
  private landing(
    x: number,
    y: number,
    size: number,
    role: string,
    color: Side,
    duration: number,
  ): Animation {
    const piece = this.spawn(`fx-ghost fx-crowned piece-icon ${role} ${color}`, {
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
    const settle = 440 / duration;
    return this.animate(
      piece,
      [
        {
          transform: `translate3d(0, ${-size * 2.2}px, ${size * 3}px) rotateY(-720deg) scale(0.2)`,
          opacity: 0,
          easing: 'cubic-bezier(.3,.8,.45,1)',
        },
        {
          transform: `translate3d(0, ${size * 0.06}px, 0) rotateY(0deg) scaleX(1.18) scaleY(0.84)`,
          opacity: 1,
          offset: settle,
          easing: 'cubic-bezier(.2,1.8,.4,1)',
        },
        {
          transform: 'translate3d(0, 0, 0) rotateY(0deg) scale(1)',
          opacity: 1,
          offset: Math.min(0.9, settle + 0.2),
        },
        { transform: 'translate3d(0, 0, 0) rotateY(0deg) scale(1)', opacity: 1 },
      ],
      duration,
    );
  }

  /** A column of light standing on a square, grown from the bottom up. */
  private pillar(x: number, y: number, size: number, duration: number): void {
    const height = y + size / 2;
    const pillar = this.spawn('fx-pillar', {
      left: `${x - size * 0.45}px`,
      top: '0',
      width: `${size * 0.9}px`,
      height: `${height}px`,
    });
    this.animate(
      pillar,
      [
        { transform: 'translateZ(0) scaleX(0.2) scaleY(0)', opacity: 0 },
        {
          transform: 'translateZ(0) scaleX(1) scaleY(1)',
          opacity: 1,
          offset: 0.2,
          easing: 'cubic-bezier(.2,1,.4,1)',
        },
        { transform: 'translateZ(0) scaleX(0.85) scaleY(1)', opacity: 1, offset: 0.6 },
        { transform: 'translateZ(0) scaleX(0) scaleY(1)', opacity: 0 },
      ],
      duration,
    );
  }

  /** Sparks that spiral up around a square. */
  private sparks(x: number, y: number, size: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const edge = Math.max(3, size * rand(0.05, 0.09));
      const spark = this.spawn('fx-spark', {
        left: `${x - edge / 2}px`,
        top: `${y - edge / 2}px`,
        width: `${edge}px`,
        height: `${edge}px`,
      });
      const start = (360 / count) * i;
      const radius = size * rand(0.45, 0.7);
      const rise = size * rand(1.6, 2.6) * this.inward(y);
      const turn = pick([-1, 1]) * 540;
      this.animate(
        spark,
        [
          {
            transform: `translateY(0) rotate(${start}deg) translateX(${radius * 0.3}px) scale(0.5)`,
            opacity: 0,
          },
          {
            transform: `translateY(${-rise * 0.3}px) rotate(${start + turn * 0.35}deg) translateX(${radius}px) scale(1)`,
            opacity: 1,
            offset: 0.3,
          },
          {
            transform: `translateY(${-rise}px) rotate(${start + turn}deg) translateX(${radius * 0.4}px) scale(0.4)`,
            opacity: 0,
          },
        ],
        rand(900, 1300),
        'cubic-bezier(.2,.6,.4,1)',
      );
    }
  }

  private shatter(
    x: number,
    y: number,
    size: number,
    palette: keyof typeof SHARDS,
    count: number,
    power: number,
    glow = false,
  ): void {
    const [light, base, dark] = SHARDS[palette];
    for (let i = 0; i < count; i++) {
      const edge = size * rand(0.09, 0.2);
      const shard = this.spawn(glow ? 'fx-shard fx-shard-glow' : 'fx-shard', {
        left: `${x - edge / 2}px`,
        top: `${y - edge / 2}px`,
        width: `${edge}px`,
        height: `${edge}px`,
      });
      shard.style.setProperty('--shard-light', light);
      shard.style.setProperty('--shard', base);
      shard.style.setProperty('--shard-dark', dark);
      const angle = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
      const reach = size * rand(0.9, 2.2) * power;
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach * 0.8;
      const dz = rand(-1, 2.5) * size * power;
      const axis = `${rand(-1, 1).toFixed(2)}, ${rand(-1, 1).toFixed(2)}, ${rand(0.2, 1).toFixed(2)}`;
      const spin = rand(360, 900);
      this.animate(
        shard,
        [
          {
            transform: `translate3d(0, 0, 0) rotate3d(${axis}, 0deg)`,
            opacity: 1,
            easing: 'cubic-bezier(.1,.8,.3,1)',
          },
          {
            transform: `translate3d(${dx * 0.65}px, ${dy * 0.65 - size * rand(0.6, 1.3)}px, ${dz}px) rotate3d(${axis}, ${spin * 0.55}deg)`,
            opacity: 1,
            offset: 0.45,
            easing: 'cubic-bezier(.5,0,.95,.6)',
          },
          {
            transform: `translate3d(${dx}px, ${dy + size * rand(1, 1.8)}px, ${dz * 0.6}px) rotate3d(${axis}, ${spin}deg) scale(0.4)`,
            opacity: 0,
          },
        ],
        rand(850, 1300),
      );
    }
  }

  private ring(x: number, y: number, size: number, scale: number): void {
    const diameter = size * scale;
    const ring = this.spawn('fx-ring', {
      left: `${x - diameter / 2}px`,
      top: `${y - diameter / 2}px`,
      width: `${diameter}px`,
      height: `${diameter}px`,
    });
    this.animate(
      ring,
      [
        { transform: 'translateZ(0) scale(0.12)', opacity: 1 },
        { transform: 'translateZ(0) scale(1)', opacity: 0 },
      ],
      620,
      'cubic-bezier(.1,.7,.3,1)',
    );
  }

  private points(x: number, y: number, size: number, points: number): void {
    const label = this.spawn('fx-points fx-gold', {
      left: `${x}px`,
      top: `${y}px`,
      fontSize: `${Math.max(12, size * 0.42)}px`,
    });
    label.textContent = `+${points}`;
    const lift = size * this.inward(y);
    this.animate(
      label,
      [
        { transform: 'translate(-50%, -50%) translateZ(0) scale(0.4)', opacity: 0 },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-lift * 0.7}px, 90px) scale(1.15)`,
          opacity: 1,
          offset: 0.25,
          easing: 'cubic-bezier(.2,1.4,.4,1)',
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-lift}px, 90px) scale(1)`,
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-lift * 1.7}px, 140px) scale(0.9)`,
          opacity: 0,
        },
      ],
      1100,
    );
  }

  private shake(amount: number): void {
    const target = this.host.parentElement;
    if (!target) return;
    const a = Math.round(amount);
    target.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${-a}px, ${a * 0.6}px) rotate(-0.4deg)` },
        { transform: `translate(${a * 0.8}px, ${-a * 0.5}px) rotate(0.35deg)` },
        { transform: `translate(${-a * 0.5}px, ${-a * 0.3}px)` },
        { transform: `translate(${a * 0.25}px, ${a * 0.2}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 380, easing: 'ease-out' },
    );
  }

  private flash(className: string, duration: number): void {
    const flash = this.spawn(className, {});
    const quick = className === 'fx-flash';
    this.animate(
      flash,
      quick
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }]
        : [
            { opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { opacity: 1, offset: 0.8 },
            { opacity: 0 },
          ],
      duration,
    );
  }

  /** Light rays turning behind the words, clipped to the board so they never cover the clocks. */
  private rays(duration: number): void {
    const width = this.width;
    const clip = this.spawn('fx-clip', {});
    const rays = this.document.createElement('div');
    rays.className = 'fx-rays';
    Object.assign(rays.style, {
      width: `${width * 1.5}px`,
      height: `${width * 1.5}px`,
      marginLeft: `${-width * 0.75}px`,
      marginTop: `${-width * 0.75}px`,
    });
    clip.append(rays);
    const removeClip = () => clip.remove();
    this.animate(
      rays,
      [
        { transform: 'rotate(0deg) scale(0.4)', opacity: 0 },
        { transform: 'rotate(40deg) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'rotate(110deg) scale(1.05)', opacity: 1, offset: 0.8 },
        { transform: 'rotate(140deg) scale(1.2)', opacity: 0 },
      ],
      duration,
    ).finished.then(removeClip, removeClip);
  }

  /** A gold crown that spins down over the words. */
  private crown(duration: number): void {
    const width = this.width;
    const crownSize = Math.max(28, width * 0.13);
    const crown = this.spawn('fx-crown', { fontSize: `${crownSize}px` });
    crown.textContent = '♛';
    this.animate(
      crown,
      [
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-width * 0.6}px, 0) rotateY(0deg)`,
          opacity: 0,
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-crownSize * 1.35}px, 60px) rotateY(540deg)`,
          opacity: 1,
          offset: 0.3,
          easing: 'cubic-bezier(.2,1.3,.4,1)',
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-crownSize * 1.35}px, 60px) rotateY(720deg)`,
          opacity: 1,
          offset: 0.85,
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${-crownSize * 2.2}px, 120px) rotateY(900deg)`,
          opacity: 0,
        },
      ],
      duration,
    );
  }

  /** Pixel snowflakes drifting down over the board. */
  private snow(count: number): void {
    const width = this.width;
    for (let i = 0; i < count; i++) {
      const size = rand(3, 7);
      const flake = this.spawn('fx-snow', {
        left: `${rand(0, width)}px`,
        top: `${-size}px`,
        width: `${size}px`,
        height: `${size}px`,
      });
      const drift = rand(-width * 0.12, width * 0.12);
      this.animate(
        flake,
        [
          { transform: `translate3d(0, 0, ${rand(-80, 120)}px) rotate(0deg)`, opacity: 0 },
          {
            transform: `translate3d(${drift * 0.5}px, ${width * 0.35}px, 40px) rotate(90deg)`,
            opacity: 1,
            offset: 0.3,
          },
          {
            transform: `translate3d(${-drift * 0.3}px, ${width * 0.7}px, 20px) rotate(200deg)`,
            opacity: 1,
            offset: 0.7,
          },
          { transform: `translate3d(${drift}px, ${width * 1.02}px, 0) rotate(300deg)`, opacity: 0 },
        ],
        rand(2000, 2600),
      );
    }
  }

  private title(text: string, tone: Tone, duration: number): void {
    const width = this.width;
    const title = this.spawn(`fx-title fx-${tone}`, {
      fontSize: `${Math.min(width * 0.075, (width * 0.9) / text.length)}px`,
    });
    title.textContent = text;
    this.animate(
      title,
      [
        {
          transform: 'translate(-50%, -50%) translateZ(-700px) rotateX(80deg) scale(0.6)',
          opacity: 0,
          easing: 'cubic-bezier(.2,.9,.3,1.2)',
        },
        {
          transform: 'translate(-50%, -50%) translateZ(90px) rotateX(-12deg) scale(1.08)',
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: 'translate(-50%, -50%) translateZ(0) rotateX(0deg) scale(1)',
          opacity: 1,
          offset: 0.3,
        },
        {
          transform: 'translate(-50%, -50%) translateZ(0) rotateX(0deg) scale(1)',
          opacity: 1,
          offset: 0.8,
        },
        {
          transform: 'translate(-50%, -50%) translateZ(320px) rotateX(-25deg) scale(1.2)',
          opacity: 0,
        },
      ],
      duration,
    );
  }

  private subtitle(text: string, duration: number, offset?: number): void {
    const width = this.width;
    const sub = this.spawn('fx-sub', {
      fontSize: `${Math.max(12, Math.min(18, width * 0.034))}px`,
    });
    sub.textContent = text;
    const y = offset ?? width * 0.09;
    this.animate(
      sub,
      [
        {
          transform: `translate(-50%, -50%) translate3d(0, ${y + 24}px, 0) scale(0.9)`,
          opacity: 0,
          easing: 'cubic-bezier(.2,1.2,.4,1)',
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${y}px, 30px) scale(1)`,
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${y}px, 30px) scale(1)`,
          opacity: 1,
          offset: 0.85,
        },
        {
          transform: `translate(-50%, -50%) translate3d(0, ${y - 20}px, 30px) scale(1)`,
          opacity: 0,
        },
      ],
      duration,
    );
  }

  /** A word built letter by letter, held for `hold` ms. Each letter has one animation, the word another. */
  private word(
    text: string,
    tone: Tone,
    entrance: 'drop' | 'assemble' | 'slam',
    hold: number,
  ): void {
    const width = this.width;
    const fontSize = Math.min(width * 0.1, (width * 0.92) / text.length);
    const word = this.spawn(`fx-word fx-${tone}`, { fontSize: `${fontSize}px` });
    const letters = [...text].map((char) => {
      const letter = this.document.createElement('span');
      letter.textContent = char === ' ' ? ' ' : char;
      word.append(letter);
      return letter;
    });
    const lettersDone = letters.length * 70 + 700;
    const total = lettersDone + hold;

    letters.forEach((letter, i) => {
      const start = entrance === 'assemble' ? rand(0, 260) : i * (entrance === 'slam' ? 40 : 70);
      let frames: Keyframe[];
      if (entrance === 'drop') {
        frames = [
          {
            transform: `translate3d(0, ${-fontSize * 3}px, ${fontSize * 6}px) rotateX(-120deg)`,
            opacity: 0,
            easing: 'cubic-bezier(.3,.9,.4,1)',
          },
          {
            transform: `translate3d(0, ${fontSize * 0.12}px, 0) rotateX(14deg)`,
            opacity: 1,
            offset: 0.6,
            easing: 'ease-out',
          },
          { transform: 'translate3d(0, 0, 0) rotateX(0deg)', opacity: 1 },
        ];
      } else if (entrance === 'assemble') {
        const axis = `${rand(-1, 1).toFixed(2)}, ${rand(-1, 1).toFixed(2)}, ${rand(-1, 1).toFixed(2)}`;
        frames = [
          {
            transform: `translate3d(${rand(-2, 2) * width * 0.4}px, ${rand(-1.5, 1.5) * width * 0.4}px, ${rand(-3, 4) * fontSize * 2}px) rotate3d(${axis}, ${rand(180, 540)}deg)`,
            opacity: 0,
            easing: 'cubic-bezier(.15,.8,.25,1)',
          },
          { transform: 'translate3d(0, 0, 0) rotate3d(0, 0, 1, 0deg)', opacity: 1 },
        ];
      } else {
        frames = [
          {
            transform: `translate3d(0, 0, ${fontSize * 14}px) rotateZ(${rand(-30, 30)}deg)`,
            opacity: 0,
            easing: 'cubic-bezier(.6,0,.9,.4)',
          },
          {
            transform: 'translate3d(0, 0, 0) rotateZ(0deg)',
            opacity: 1,
            offset: 0.7,
            easing: 'cubic-bezier(.2,2,.4,1)',
          },
          { transform: 'translate3d(0, 0, 0) rotateZ(0deg)', opacity: 1 },
        ];
      }
      letter.animate(frames, {
        duration: entrance === 'assemble' ? 900 : 650,
        delay: start,
        fill: 'both',
      });
    });

    const outAt = (total - 350) / total;
    this.animate(
      word,
      [
        { transform: 'translate(-50%, -50%) translateZ(0) scale(1)', opacity: 1 },
        {
          transform: 'translate(-50%, -50%) translateZ(0) scale(1)',
          opacity: 1,
          offset: lettersDone / total,
        },
        {
          transform: 'translate(-50%, -50%) translateZ(30px) scale(1.06)',
          opacity: 1,
          offset: Math.min(outAt - 0.01, lettersDone / total + 0.06),
        },
        { transform: 'translate(-50%, -50%) translateZ(0) scale(1)', opacity: 1, offset: outAt },
        { transform: 'translate(-50%, -50%) translateZ(260px) scale(1.2)', opacity: 0 },
      ],
      total,
    );
  }
}
