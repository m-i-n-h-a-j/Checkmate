import { Component, input } from '@angular/core';

export type IconName =
  | 'watch'
  | 'play'
  | 'friends'
  | 'copy'
  | 'link'
  | 'user'
  | 'logout'
  | 'crown'
  | 'plus'
  | 'flip'
  | 'sound'
  | 'sound-off'
  | 'sparkles'
  | 'sparkles-off'
  | 'bot'
  | 'music'
  | 'music-off'
  | 'pause'
  | 'play-video';

/** Chunky 24px line icons drawn on a pixel grid. */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden="true"
      [attr.width]="size()"
      [attr.height]="size()"
    >
      @switch (name()) {
        @case ('watch') {
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <rect x="10" y="10" width="4" height="4" />
        }
        @case ('play') {
          <rect x="3" y="7" width="18" height="11" rx="2" />
          <path d="M7 11v3M5.5 12.5h3M15 11h.01M18 13h.01" />
        }
        @case ('friends') {
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c1.8.8 3 2.7 3 5" />
        }
        @case ('copy') {
          <rect x="8" y="8" width="12" height="12" rx="1" />
          <path d="M4 16V4h12" />
        }
        @case ('link') {
          <path
            d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
          />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        }
        @case ('logout') {
          <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
        }
        @case ('crown') {
          <path d="M3 18h18M4 15 3 7l5 4 4-6 4 6 5-4-1 8H4Z" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('flip') {
          <path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4" />
        }
        @case ('sound') {
          <path d="M3 9h4l5-4v14l-5-4H3V9ZM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
        }
        @case ('sound-off') {
          <path d="M3 9h4l5-4v14l-5-4H3V9ZM16 9l6 6M22 9l-6 6" />
        }
        @case ('sparkles') {
          <path
            d="m10 4 1.8 5.2L17 11l-5.2 1.8L10 18l-1.8-5.2L3 11l5.2-1.8L10 4ZM19 2v4M17 4h4M19 17v4M17 19h4"
          />
        }
        @case ('music') {
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        }
        @case ('music-off') {
          <path d="M9 18V9m0-4V5l11-2v4m0 4v6" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
          <path d="M3 3l18 18" />
        }
        @case ('pause') {
          <path d="M8 5v14M16 5v14" />
        }
        @case ('play-video') {
          <path d="M7 4v16l13-8L7 4Z" />
        }
        @case ('bot') {
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 4v4M9 13h.01M15 13h.01M9 17h6M2 12v4M22 12v4" />
        }
        @case ('sparkles-off') {
          <path d="m10 4 1.8 5.2L17 11l-5.2 1.8L10 18l-1.8-5.2L3 11l5.2-1.8L10 4ZM3 21 21 3" />
        }
      }
    </svg>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
}
