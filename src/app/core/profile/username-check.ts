import { Signal, effect, inject, signal, untracked } from '@angular/core';
import { normalizeUsername, usernameProblem } from '../util/username';
import { ProfileService } from './profile.service';

export type UsernameStatus =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'current' }
  | { kind: 'error' };

/** Live, debounced availability check for a username field. Must be called in an injection context. */
export function usernameStatus(value: Signal<string>, debounceMs = 400): Signal<UsernameStatus> {
  const profiles = inject(ProfileService);
  const status = signal<UsernameStatus>({ kind: 'empty' });

  effect((onCleanup) => {
    const name = normalizeUsername(value());
    if (!name) {
      status.set({ kind: 'empty' });
      return;
    }
    const problem = usernameProblem(name);
    if (problem) {
      status.set({ kind: 'invalid', message: problem });
      return;
    }
    if (name === untracked(profiles.profile)?.username) {
      status.set({ kind: 'current' });
      return;
    }
    status.set({ kind: 'checking' });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const available = await profiles.isUsernameAvailable(name);
        if (!cancelled) {
          status.set({ kind: available ? 'available' : 'taken' });
        }
      } catch {
        if (!cancelled) {
          status.set({ kind: 'error' });
        }
      }
    }, debounceMs);
    onCleanup(() => {
      cancelled = true;
      clearTimeout(timer);
    });
  });

  return status.asReadonly();
}
