import { Service, computed, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { AUTH } from '../firebase/firebase';

@Service()
export class AuthService {
  private readonly auth = inject(AUTH);
  /** undefined until Firebase restores the session, then the user or null. */
  private readonly userState = signal<User | null | undefined>(undefined);
  private resolveReady!: (user: User | null) => void;

  readonly user = this.userState.asReadonly();
  readonly uid = computed(() => this.userState()?.uid ?? null);
  readonly signingIn = signal(false);
  /** Resolves once the initial auth state is known. Read user() afterwards for the current state. */
  readonly ready = new Promise<User | null>((resolve) => (this.resolveReady = resolve));

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.userState.set(user);
      this.resolveReady(user);
    });
    getRedirectResult(this.auth).catch((error: unknown) =>
      console.error('Redirect sign-in failed', error),
    );
  }

  /** One tap: Google's account chooser, then done. Returns false if the player closed the chooser. */
  async signInWithGoogle(): Promise<boolean> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    this.signingIn.set(true);
    try {
      await signInWithPopup(this.auth, provider);
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-environment') {
        await signInWithRedirect(this.auth, provider);
        return false;
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return false;
      }
      throw error;
    } finally {
      this.signingIn.set(false);
    }
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
