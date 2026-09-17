import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { EffectsService } from '../../core/settings/effects.service';
import { Icon } from '../../shared/ui/icon';

type Shape = 'wide' | 'tall';

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

const PAUSED_KEY = 'checkmate.skyVideo';
/** Screens at least this wide for their height get the 16:9 video; narrower ones the 4:5 crop. */
const WIDE_QUERY = '(min-aspect-ratio: 6/5)';

function readPaused(): boolean {
  try {
    return localStorage.getItem(PAUSED_KEY) === 'paused';
  } catch {
    return false;
  }
}

/**
 * The home page sky: a slow-motion render wrapped around the horizon like a curved cinema screen.
 * The wrap, the dimming and the loop's dip to black are baked into the video files by
 * `npm run video:sky`, so the page only plays a masked video, decoded in hardware.
 *
 * Each visitor gets the file that fits their screen: a 16:9 or 4:5 crop, at 1080p or 720p depending
 * on how many pixels the sky covers and how fast the connection is. Light effects mode, reduced
 * motion and data saver show a still frame instead. The video pauses while the hero is scrolled
 * away or the tab is hidden, and a button pauses it for good (WCAG 2.2.2).
 */
@Component({
  selector: 'app-home-sky',
  imports: [Icon],
  template: `
    @if (moving()) {
      <video
        #video
        class="sky"
        muted
        playsinline
        loop
        preload="auto"
        disablepictureinpicture
        disableremoteplayback
        aria-hidden="true"
        tabindex="-1"
        [poster]="poster()"
      ></video>
    } @else {
      <img class="sky" [src]="poster()" alt="" />
    }
    <div class="sky-dim" aria-hidden="true"></div>
    @if (moving()) {
      <button
        type="button"
        class="btn btn-ghost btn-sm absolute top-4 right-4 size-10 p-0"
        [attr.aria-label]="paused() ? 'Play background video' : 'Pause background video'"
        [title]="paused() ? 'Play background video' : 'Pause background video'"
        (click)="togglePaused()"
      >
        <app-icon [name]="paused() ? 'play-video' : 'pause'" [size]="18" />
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    /* Fixed like the arcade floor, so the video's bottom edge always sits on the horizon line. */
    .sky,
    .sky-dim {
      position: fixed;
      inset: 0;
      z-index: -1;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .sky {
      object-fit: cover;
      /* The horizon is 80% down both the video and the screen, so cropping keeps them aligned. */
      object-position: 50% 80%;
      /* Solid sky that fades out exactly at the horizon, leaving the floor untouched. */
      -webkit-mask-image: linear-gradient(
        180deg,
        rgb(0 0 0 / 0.55) 0%,
        #000 22%,
        #000 58%,
        transparent 80%
      );
      mask-image: linear-gradient(
        180deg,
        rgb(0 0 0 / 0.55) 0%,
        #000 22%,
        #000 58%,
        transparent 80%
      );
    }
    /* Extra shade behind the sign and tagline so text keeps 4.5:1 contrast over the brightest frames. */
    .sky-dim {
      background: radial-gradient(60% 45% at 50% 52%, rgb(10 6 18 / 0.68), transparent 75%);
      -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent 80%);
      mask-image: linear-gradient(180deg, #000 70%, transparent 80%);
    }
    /* On tall screens the tagline wraps across most of the width, so shade a wide band instead. */
    @media (max-aspect-ratio: 6/5) {
      .sky-dim {
        background: radial-gradient(
          95% 34% at 50% 47%,
          rgb(10 6 18 / 0.58) 0%,
          rgb(10 6 18 / 0.52) 55%,
          transparent 100%
        );
      }
    }
  `,
})
export class HomeSky {
  private readonly document = inject(DOCUMENT);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly effects = inject(EffectsService);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  private readonly view = this.document.defaultView;
  private readonly connection = (
    this.view?.navigator as Navigator & { connection?: NetworkInformation }
  )?.connection;
  private readonly prefersReducedMotion =
    this.view?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;

  private readonly shape = signal<Shape>(
    this.view?.matchMedia(WIDE_QUERY).matches === false ? 'tall' : 'wide',
  );
  private readonly inView = signal(true);
  private readonly tabVisible = signal(this.document.visibilityState !== 'hidden');

  protected readonly paused = signal(readPaused());
  protected readonly moving = computed(
    () => this.effects.full() && !this.prefersReducedMotion && !this.connection?.saveData,
  );
  protected readonly poster = computed(() => `video/sky-${this.shape()}.jpg`);
  private readonly source = computed(() => `video/sky-${this.shape()}-${this.quality()}.mp4`);

  constructor() {
    const root = this.document.documentElement;
    root.classList.add('sky-video');

    const wide = this.view?.matchMedia(WIDE_QUERY);
    const onShape = () => this.shape.set(wide?.matches === false ? 'tall' : 'wide');
    wide?.addEventListener('change', onShape);
    const onVisibility = () => this.tabVisible.set(this.document.visibilityState !== 'hidden');
    this.document.addEventListener('visibilitychange', onVisibility);

    let observer: IntersectionObserver | undefined;
    afterNextRender(() => {
      const hero = this.host.parentElement;
      if (!hero || typeof IntersectionObserver === 'undefined') return;
      // Stop decoding once the hero scrolls away: panels with blurred backgrounds cover the sky then.
      observer = new IntersectionObserver(
        ([entry]) => this.inView.set(entry.intersectionRatio > 0.1),
        {
          threshold: [0, 0.1, 0.2],
        },
      );
      observer.observe(hero);
    });

    // Load the right file, keeping the playback position when a rotation swaps the crop.
    effect(() => {
      const video = this.video()?.nativeElement;
      const source = this.source();
      if (!video) return;
      untracked(() => {
        if (video.getAttribute('src') === source) return;
        const resumeAt = video.currentTime;
        video.setAttribute('src', source);
        if (resumeAt > 0) {
          video.addEventListener('loadedmetadata', () => (video.currentTime = resumeAt), {
            once: true,
          });
        }
      });
    });

    effect(() => {
      const video = this.video()?.nativeElement;
      const play = !this.paused() && this.inView() && this.tabVisible();
      this.source();
      if (!video) return;
      if (play) {
        // Autoplay can still be refused (iOS Low Power Mode); the poster stays up then.
        video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });

    inject(DestroyRef).onDestroy(() => {
      root.classList.remove('sky-video');
      wide?.removeEventListener('change', onShape);
      this.document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    });
  }

  protected togglePaused(): void {
    const paused = !this.paused();
    this.paused.set(paused);
    try {
      localStorage.setItem(PAUSED_KEY, paused ? 'paused' : 'playing');
    } catch {
      // Storage unavailable: the choice lasts for this visit.
    }
  }

  /** 1080p when the sky covers more than ~820 device pixels of height on a decent connection. */
  private quality(): 1080 | 720 {
    const view = this.view;
    if (!view) return 720;
    // effectiveType is the only reliable signal: Chrome reports a placeholder downlink until it
    // has measured the connection.
    const slow = ['slow-2g', '2g', '3g'].includes(this.connection?.effectiveType ?? '');
    const width = view.innerWidth;
    const height = view.innerHeight;
    // The video covers the screen, so the rendered height is whichever side forces the larger scale.
    const aspect = this.shape() === 'wide' ? 16 / 9 : 4 / 5;
    const shownHeight = Math.max(height, width / aspect);
    const density = Math.min(view.devicePixelRatio || 1, 1.5);
    return !slow && shownHeight * density > 820 ? 1080 : 720;
  }
}
