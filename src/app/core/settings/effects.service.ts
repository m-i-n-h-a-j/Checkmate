import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';

const STORAGE_KEY = 'checkmate.effects';

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * The player's choice between full arcade effects (the default) and a light mode for slower
 * devices. Light mode turns off the 3D board cinematics, the rolling floor, looping sign lights and
 * background blurs. The operating system's reduced motion setting is honored either way.
 */
@Service()
export class EffectsService {
  private readonly fullState = signal(readSetting());
  /** True when heavy effects are on. */
  readonly full = this.fullState.asReadonly();

  constructor() {
    const root = inject(DOCUMENT).documentElement;
    effect(() => root.classList.toggle('fx-lite', !this.fullState()));
  }

  toggle(): void {
    const full = !this.fullState();
    this.fullState.set(full);
    try {
      localStorage.setItem(STORAGE_KEY, full ? 'on' : 'off');
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  }
}
