import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ElementRef,
} from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { ProfileService } from '../../core/profile/profile.service';
import { usernameStatus } from '../../core/profile/username-check';
import { safeNext } from '../../core/util/navigation';
import { DISPLAY_NAME_MAX, normalizeUsername, usernameIdeas } from '../../core/util/username';
import { burst } from '../../shared/fx/burst';
import { Avatar } from '../../shared/ui/avatar';
import { ToastService } from '../../shared/ui/toast.service';
import { UsernameHint } from '../../shared/ui/username-hint';

@Component({
  selector: 'app-setup',
  imports: [FormField, Avatar, UsernameHint],
  templateUrl: './setup.html',
})
export class Setup {
  protected readonly profiles = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly next = input<string>();

  protected readonly model = signal({ displayName: '', username: '' });
  protected readonly setupForm = form(this.model, (path) => {
    required(path.displayName, { message: 'Enter a display name.' });
    maxLength(path.displayName, DISPLAY_NAME_MAX, {
      message: `Keep it to ${DISPLAY_NAME_MAX} characters.`,
    });
  });
  protected readonly username = computed(() => normalizeUsername(this.model().username));
  protected readonly usernameStatus = usernameStatus(this.username);
  protected readonly ideas = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly canSave = computed(
    () =>
      this.setupForm().valid() &&
      !this.saving() &&
      ['empty', 'available', 'current'].includes(this.usernameStatus().kind),
  );

  private readonly saveButton = viewChild<ElementRef<HTMLElement>>('saveButton');

  constructor() {
    let prefilled = false;
    effect(() => {
      const profile = this.profiles.profile();
      if (!profile || prefilled) {
        return;
      }
      prefilled = true;
      untracked(() => {
        this.model.set({ displayName: profile.displayName, username: profile.username ?? '' });
        void this.loadIdeas(profile.displayName);
      });
    });

    // Keep the username field in its stored form as the player types.
    effect(() => {
      const raw = this.model().username;
      const clean = raw.replace(/^@+/, '').replace(/\s/g, '_').toLowerCase();
      if (clean !== raw) {
        untracked(() => this.model.update((m) => ({ ...m, username: clean })));
      }
    });
  }

  private async loadIdeas(displayName: string): Promise<void> {
    const results = await Promise.all(
      usernameIdeas(displayName).map(async (idea) =>
        (await this.profiles.isUsernameAvailable(idea).catch(() => false)) ? idea : null,
      ),
    );
    this.ideas.set(results.filter((idea): idea is string => idea !== null).slice(0, 4));
  }

  protected pick(idea: string): void {
    this.model.update((m) => ({ ...m, username: idea }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.profiles.saveProfile(this.model());
      burst(this.saveButton()?.nativeElement);
      this.toasts.success(
        'Player created',
        this.username() ? `Friends can now find you as @${this.username()}.` : undefined,
      );
      await this.router.navigateByUrl(safeNext(this.next()));
    } catch (error) {
      this.toasts.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async skip(): Promise<void> {
    try {
      await this.profiles.skipOnboarding();
      await this.router.navigateByUrl(safeNext(this.next()));
    } catch (error) {
      this.toasts.error(error);
    }
  }
}
