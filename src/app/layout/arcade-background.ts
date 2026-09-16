import { Component, input } from '@angular/core';

/** Fixed backdrop: a striped king setting behind a neon chessboard floor that rolls toward the player. */
@Component({
  selector: 'app-arcade-background',
  template: `
    <div class="scene" [class.calm]="mode() === 'calm'" aria-hidden="true">
      <div class="sky"></div>
      <div class="sunset"><span class="king">♚</span></div>
      <div class="floor-wrap"><div class="floor"></div></div>
      <div class="horizon"></div>
    </div>
  `,
  styles: `
    :host {
      --horizon: 80%;
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .scene {
      position: absolute;
      inset: 0;
      transition: opacity 600ms ease;
    }
    .calm {
      opacity: 0.45;
    }
    .calm .sunset {
      opacity: 0;
    }
    .sky {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(55% 40% at 50% var(--horizon), rgb(255 46 136 / 0.32), transparent 70%),
        linear-gradient(180deg, #05020b 0%, #0a0612 50%, #1c0b2e var(--horizon), #0a0612 100%);
    }
    .sunset {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: var(--horizon);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      overflow: hidden;
      transition: opacity 600ms ease;
    }
    .king {
      display: block;
      font-size: min(64vw, 58vh, 560px);
      line-height: 1;
      transform: translateY(16%);
      background: linear-gradient(180deg, #ffe7a3 0%, #ffc94a 40%, #ff6a5a 70%, #ff2e88 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      -webkit-mask-image: linear-gradient(
        180deg,
        #000 55%,
        transparent 55% 58%,
        #000 58% 66%,
        transparent 66% 70%,
        #000 70% 76%,
        transparent 76% 81%,
        #000 81%
      );
      mask-image: linear-gradient(
        180deg,
        #000 55%,
        transparent 55% 58%,
        #000 58% 66%,
        transparent 66% 70%,
        #000 70% 76%,
        transparent 76% 81%,
        #000 81%
      );
      opacity: 0.26;
      filter: drop-shadow(0 0 50px rgb(255 110 80 / 0.5));
    }
    .horizon {
      position: absolute;
      left: 0;
      right: 0;
      top: var(--horizon);
      height: 2px;
      background: linear-gradient(
        90deg,
        transparent,
        #ffc94a 15%,
        #fff1c2 50%,
        #ffc94a 85%,
        transparent
      );
      box-shadow: 0 0 22px 3px rgb(255 201 74 / 0.5);
    }
    /* A floor plane viewed from eye height: rotated flat, vanishing exactly at the horizon line. */
    .floor-wrap {
      position: absolute;
      left: 0;
      right: 0;
      top: var(--horizon);
      bottom: 0;
      overflow: hidden;
      perspective: 320px;
      perspective-origin: 50% 0;
    }
    .floor {
      position: absolute;
      left: -350%;
      right: -350%;
      bottom: 0;
      height: 2600px;
      transform-origin: 50% 100%;
      transform: rotateX(90deg);
      background-image:
        linear-gradient(rgb(34 240 255 / 0.75) 3px, transparent 3px),
        linear-gradient(90deg, rgb(34 240 255 / 0.75) 3px, transparent 3px),
        conic-gradient(
          rgb(255 46 136 / 0.22) 25%,
          transparent 0 50%,
          rgb(255 46 136 / 0.22) 0 75%,
          transparent 0
        );
      background-size:
        120px 120px,
        120px 120px,
        240px 240px;
      background-position: center bottom;
      -webkit-mask-image: linear-gradient(180deg, transparent 50%, #000 88%);
      mask-image: linear-gradient(180deg, transparent 50%, #000 88%);
      animation: floor-roll 4s linear infinite;
    }
    @keyframes floor-roll {
      from {
        background-position:
          50% 0,
          50% 0,
          50% 0;
      }
      to {
        background-position:
          50% 240px,
          50% 240px,
          50% 240px;
      }
    }
  `,
})
export class ArcadeBackground {
  readonly mode = input<'hero' | 'calm'>('hero');
}
