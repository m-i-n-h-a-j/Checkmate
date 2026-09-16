import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { FriendsService } from './core/friends/friends.service';
import { PresenceService } from './core/presence/presence.service';
import { ProfileService } from './core/profile/profile.service';
import { AppUpdateService } from './core/pwa/app-update.service';
import { RoomsService } from './core/rooms/rooms.service';
import { ArcadeBackground } from './layout/arcade-background';
import { Avatar } from './shared/ui/avatar';
import { Icon } from './shared/ui/icon';
import { ToastHost } from './shared/ui/toast-host';
import { ToastService } from './shared/ui/toast.service';

/** Only alert about invites that arrived moments ago, not ones waiting from an earlier visit. */
const FRESH_INVITE_MS = 90_000;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ArcadeBackground, Avatar, Icon, ToastHost],
  templateUrl: './app.html',
  host: { '(document:keydown.escape)': 'menuOpen.set(false)' },
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly profiles = inject(ProfileService);
  protected readonly friends = inject(FriendsService);
  protected readonly rooms = inject(RoomsService);
  protected readonly presence = inject(PresenceService);
  private readonly updates = inject(AppUpdateService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly currentPath = computed(() => this.url().split(/[?#]/)[0]);
  protected readonly isHome = computed(() => this.currentPath() === '/');
  protected readonly requestCount = computed(() => this.friends.incoming().length);

  constructor() {
    this.routeAfterSignIn();
    this.announceFriendRequests();
    this.announceChallenges();
    this.offerUpdates();
  }

  protected async signIn(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.toasts.error(error);
    }
  }

  protected async signOut(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }

  /** New players land on setup once; everyone else continues to where the sign-in prompt was sending them. */
  private routeAfterSignIn(): void {
    let setupShown = false;
    effect(() => {
      const profile = this.profiles.profile();
      const url = this.url();
      if (!profile) {
        return;
      }
      const tree = this.router.parseUrl(url);
      const next = tree.queryParams['next'] as string | undefined;
      const path = url.split(/[?#]/)[0];

      if (!profile.onboardingSeen && !setupShown && path !== '/setup') {
        setupShown = true;
        untracked(() =>
          this.router.navigate(['/setup'], {
            queryParams: { next: next ?? (path === '/' ? '/play' : url) },
          }),
        );
      } else if (
        profile.onboardingSeen &&
        path === '/' &&
        tree.queryParams['signin'] &&
        next?.startsWith('/')
      ) {
        untracked(() => this.router.navigateByUrl(next));
      }
    });
  }

  private announceFriendRequests(): void {
    const seen = new Set<string>();
    effect(() => {
      for (const request of this.friends.incoming()) {
        const sentAt = request.createdAt?.toMillis() ?? 0;
        if (seen.has(request.id) || Date.now() - sentAt > FRESH_INVITE_MS) {
          seen.add(request.id);
          continue;
        }
        seen.add(request.id);
        if (untracked(this.currentPath) === '/friends') {
          continue;
        }
        untracked(() =>
          this.toasts.show(
            {
              tone: 'invite',
              title: `${request.fromPlayer.displayName} wants to be friends`,
              actions: [
                {
                  label: 'Accept',
                  run: () =>
                    this.friends
                      .accept(request)
                      .then(() =>
                        this.toasts.success(
                          `You and ${request.fromPlayer.displayName} are friends`,
                        ),
                      )
                      .catch((error: unknown) => this.toasts.error(error)),
                },
                { label: 'View', style: 'ghost', run: () => this.router.navigateByUrl('/friends') },
              ],
            },
            12_000,
          ),
        );
      }
    });
  }

  private announceChallenges(): void {
    const open = new Map<string, number>();
    effect(() => {
      const challenges = this.rooms.incomingChallenges();
      const codes = new Set(challenges.map((room) => room.code));
      untracked(() => {
        for (const [code, toastId] of open) {
          if (!codes.has(code)) {
            this.toasts.dismiss(toastId);
            open.delete(code);
          }
        }
        for (const room of challenges) {
          const sentAt = room.createdAt?.toMillis() ?? 0;
          if (
            open.has(room.code) ||
            Date.now() - sentAt > FRESH_INVITE_MS ||
            this.currentPath() === '/play'
          ) {
            continue;
          }
          const toastId = this.toasts.show(
            {
              tone: 'invite',
              title: `${room.host.displayName} challenged you`,
              message: 'Accept to take the other seat.',
              actions: [
                {
                  label: 'Accept',
                  run: () =>
                    this.rooms
                      .join(room.code)
                      .then((code) => this.router.navigate(['/room', code]))
                      .catch((error: unknown) => this.toasts.error(error)),
                },
                {
                  label: 'Decline',
                  style: 'ghost',
                  run: () =>
                    this.rooms.decline(room).catch((error: unknown) => this.toasts.error(error)),
                },
              ],
            },
            null,
          );
          open.set(room.code, toastId);
        }
      });
    });
  }

  /** Never reload on the player's behalf: a live match may be on screen. */
  private offerUpdates(): void {
    const refresh = { label: 'Refresh', run: () => this.updates.reload() };
    effect(() => {
      if (this.updates.ready()) {
        untracked(() =>
          this.toasts.show(
            {
              tone: 'info',
              title: 'New version of Checkmate',
              message: 'Refresh when you are ready to load it.',
              actions: [refresh, { label: 'Later', style: 'ghost', run: () => undefined }],
            },
            null,
          ),
        );
      }
    });
    effect(() => {
      if (this.updates.broken()) {
        untracked(() =>
          this.toasts.show(
            {
              tone: 'error',
              title: 'Checkmate needs a refresh',
              message: 'Part of the app could not load. Refreshing fixes it.',
              actions: [refresh],
            },
            null,
          ),
        );
      }
    });
  }
}
