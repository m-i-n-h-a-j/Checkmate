import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileService } from '../../core/profile/profile.service';
import { usernameStatus } from '../../core/profile/username-check';
import { DISPLAY_NAME_MAX, normalizeUsername } from '../../core/util/username';
import { Avatar } from '../../shared/ui/avatar';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { UsernameHint } from '../../shared/ui/username-hint';

@Component({
  selector: 'app-profile',
  imports: [FormField, Avatar, Icon, UsernameHint],
  templateUrl: './profile.html',
})
export class Profile {
  protected readonly profiles = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly model = signal({ displayName: '', username: '' });
  protected readonly profileForm = form(this.model, (path) => {
    required(path.displayName, { message: 'Enter a display name.' });
    maxLength(path.displayName, DISPLAY_NAME_MAX, {
      message: `Keep it to ${DISPLAY_NAME_MAX} characters.`,
    });
  });
  protected readonly username = computed(() => normalizeUsername(this.model().username));
  protected readonly usernameStatus = usernameStatus(this.username);
  protected readonly saving = signal(false);
  protected readonly copied = signal(false);

  protected readonly dirty = computed(() => {
    const profile = this.profiles.profile();
    const model = this.model();
    return (
      !!profile &&
      (model.displayName.trim() !== profile.displayName ||
        this.username() !== (profile.username ?? ''))
    );
  });
  protected readonly canSave = computed(() => {
    const hadUsername = !!this.profiles.profile()?.username;
    const status = this.usernameStatus().kind;
    const usernameOk =
      status === 'available' || status === 'current' || (status === 'empty' && !hadUsername);
    return this.dirty() && this.profileForm().valid() && usernameOk && !this.saving();
  });

  constructor() {
    let filledFor: string | null = null;
    effect(() => {
      const profile = this.profiles.profile();
      if (!profile || filledFor === profile.uid) return;
      filledFor = profile.uid;
      untracked(() =>
        this.model.set({ displayName: profile.displayName, username: profile.username ?? '' }),
      );
    });

    effect(() => {
      const raw = this.model().username;
      const clean = raw.replace(/^@+/, '').replace(/\s/g, '_').toLowerCase();
      if (clean !== raw) {
        untracked(() => this.model.update((m) => ({ ...m, username: clean })));
      }
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      await this.profiles.saveProfile(this.model());
      this.toasts.success('Profile saved');
    } catch (error) {
      this.toasts.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async copyId(uid: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(uid);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.toasts.show({
        tone: 'error',
        title: "Couldn't copy. Select the ID and copy it yourself.",
      });
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }
}
