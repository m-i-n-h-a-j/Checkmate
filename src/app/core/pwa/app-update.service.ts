import { DOCUMENT, Service, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** Tabs and installed apps can stay open for hours, so ask for a new build now and then. */
const CHECK_EVERY_MS = 30 * 60_000;
/** Coming back to the app checks too, but not on every quick tab switch. */
const MIN_CHECK_GAP_MS = 5 * 60_000;

/** Tracks new app builds delivered by the service worker. */
@Service()
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private lastCheck = Date.now();

  private readonly readyState = signal(false);
  private readonly brokenState = signal(false);
  /** A newer build is downloaded and runs after a reload. */
  readonly ready = this.readyState.asReadonly();
  /** The cached build can no longer load, so only a reload recovers. */
  readonly broken = this.brokenState.asReadonly();

  constructor() {
    if (!this.updates.isEnabled) {
      return;
    }
    this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.readyState.set(true);
      }
    });
    this.updates.unrecoverable.subscribe(() => this.brokenState.set(true));

    const check = () => {
      if (Date.now() - this.lastCheck < MIN_CHECK_GAP_MS) {
        return;
      }
      this.lastCheck = Date.now();
      this.updates.checkForUpdate().catch(() => undefined);
    };
    setInterval(check, CHECK_EVERY_MS);
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') {
        check();
      }
    });
  }

  async reload(): Promise<void> {
    if (this.readyState() && !this.brokenState()) {
      await this.updates.activateUpdate().catch(() => false);
    }
    this.document.location.reload();
  }
}
