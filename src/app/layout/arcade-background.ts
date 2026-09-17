import { Component, inject, input } from '@angular/core';
import { EffectsService } from '../core/settings/effects.service';

/** Fixed backdrop: a striped king setting behind a neon chessboard floor that rolls toward the player. */
@Component({
  selector: 'app-arcade-background',
  template: `
    <div
      class="scene"
      [class.calm]="mode() === 'calm'"
      [class.still]="!effects.full()"
      aria-hidden="true"
    >
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
      /*
       * Fades the floor out 1300px deep (depth d lands at 320 / (320 + d) of this box's height).
       * It sits here, not on the floor, so the fade holds still while the checkers slide under it.
       */
      -webkit-mask-image: linear-gradient(
        180deg,
        transparent 19.75%,
        rgb(0 0 0 / 0.2) 22.5%,
        rgb(0 0 0 / 0.4) 26.1%,
        rgb(0 0 0 / 0.6) 31.2%,
        rgb(0 0 0 / 0.8) 38.6%,
        #000 50.6%
      );
      mask-image: linear-gradient(
        180deg,
        transparent 19.75%,
        rgb(0 0 0 / 0.2) 22.5%,
        rgb(0 0 0 / 0.4) 26.1%,
        rgb(0 0 0 / 0.6) 31.2%,
        rgb(0 0 0 / 0.8) 38.6%,
        #000 50.6%
      );
    }
    /*
     * Just the visible plane: 1300px deep plus one slide, wide enough to reach the screen edges
     * there. It rolls by transform so the compositor moves checkers drawn once; animating
     * background-position would repaint this whole surface every frame. No grid lines: thin lines
     * on a plane this tilted shrink below a pixel in the distance and flicker as they slide.
     */
    .floor {
      position: absolute;
      left: -200%;
      right: -200%;
      bottom: 0;
      height: 1560px;
      transform-origin: 50% 100%;
      transform: rotateX(90deg);
      background-image: conic-gradient(
        rgb(255 46 136 / 0.22) 25%,
        transparent 0 50%,
        rgb(255 46 136 / 0.22) 0 75%,
        transparent 0
      );
      background-size: 240px 240px;
      background-position: center bottom;
      animation: floor-roll 4s linear infinite;
    }
    /* The home page's video sky replaces the striped king; the floor and horizon stay. */
    :host-context(.sky-video) .sunset {
      opacity: 0;
    }
    .still .floor {
      animation: none;
    }
    /* One checker period toward the player, so the loop is seamless. */
    @keyframes floor-roll {
      from {
        transform: rotateX(90deg) translateY(0);
      }
      to {
        transform: rotateX(90deg) translateY(240px);
      }
    }
  `,
})
export class ArcadeBackground {
  protected readonly effects = inject(EffectsService);
  readonly mode = input<'hero' | 'calm'>('hero');
}
