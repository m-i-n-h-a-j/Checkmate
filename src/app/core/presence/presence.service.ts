import { DOCUMENT, Service, computed, effect, inject, signal } from '@angular/core';
import { Timestamp, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIRESTORE } from '../firebase/firebase';
import { ProfileService } from '../profile/profile.service';
import { timeAgo } from '../util/time';

const HEARTBEAT_MS = 60_000;
const ONLINE_WINDOW_MS = 150_000;

/** Lightweight presence: a lastActive heartbeat while the tab is visible. */
@Service()
export class PresenceService {
  private readonly nowState = signal(Date.now());
  /** Coarse clock (30s) for presence and "ago" labels. */
  readonly now = this.nowState.asReadonly();

  constructor() {
    const db = inject(FIRESTORE);
    const auth = inject(AuthService);
    const profiles = inject(ProfileService);
    const document = inject(DOCUMENT);
    const hasProfile = computed(() => profiles.profile() !== null);

    setInterval(() => this.nowState.set(Date.now()), 30_000);

    effect((onCleanup) => {
      const uid = auth.uid();
      if (!uid || !hasProfile()) {
        return;
      }
      const ref = doc(db, 'users', uid);
      const beat = () => {
        if (document.visibilityState === 'visible') {
          updateDoc(ref, { lastActive: serverTimestamp() }).catch(() => undefined);
        }
      };
      beat();
      const timer = setInterval(beat, HEARTBEAT_MS);
      document.addEventListener('visibilitychange', beat);
      onCleanup(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', beat);
      });
    });
  }

  isOnline(player: { lastActive: Timestamp | null } | null | undefined): boolean {
    const last = player?.lastActive?.toMillis();
    return last !== undefined && this.now() - last < ONLINE_WINDOW_MS;
  }

  statusLabel(player: { lastActive: Timestamp | null } | null | undefined): string {
    if (this.isOnline(player)) {
      return 'Online';
    }
    const last = player?.lastActive?.toMillis();
    return last === undefined ? 'Offline' : `Seen ${timeAgo(last, this.now())}`;
  }
}
