import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { messageFor } from '../../core/errors';
import { FriendsService } from '../../core/friends/friends.service';
import { Friend, FriendRequest, snapshotOf } from '../../core/models';
import { PresenceService } from '../../core/presence/presence.service';
import { RoomsService } from '../../core/rooms/rooms.service';
import { burst } from '../../shared/fx/burst';
import { Avatar } from '../../shared/ui/avatar';
import { ToastService } from '../../shared/ui/toast.service';

@Component({
  selector: 'app-friends',
  imports: [FormField, Avatar],
  templateUrl: './friends.html',
})
export class Friends {
  protected readonly friends = inject(FriendsService);
  protected readonly presence = inject(PresenceService);
  private readonly rooms = inject(RoomsService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly model = signal({ lookup: '' });
  protected readonly addForm = form(this.model);
  protected readonly sending = signal(false);
  protected readonly addError = signal<string | null>(null);
  /** Request id, friend uid or friendship id currently being acted on. */
  protected readonly busy = signal<string | null>(null);
  /** Friendship id whose Remove button needs a second tap. */
  protected readonly removeArmed = signal<string | null>(null);

  private readonly addButton = viewChild<ElementRef<HTMLElement>>('addButton');

  protected async add(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) return;
    this.sending.set(true);
    this.addError.set(null);
    try {
      const { result, player } = await this.friends.sendRequest(this.model().lookup);
      this.model.set({ lookup: '' });
      if (result === 'accepted') {
        burst(this.addButton()?.nativeElement);
        this.toasts.success(
          `You and ${player.displayName} are friends`,
          'They had already sent you a request.',
        );
      } else {
        this.toasts.success(
          `Request sent to ${player.displayName}`,
          "They'll see it next time they're on.",
        );
      }
    } catch (error) {
      this.addError.set(messageFor(error));
    } finally {
      this.sending.set(false);
    }
  }

  private async act(key: string, action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(key);
    try {
      await action();
    } catch (error) {
      this.toasts.error(error);
    } finally {
      this.busy.set(null);
    }
  }

  protected accept(request: FriendRequest, event: Event): void {
    const origin = event.currentTarget as HTMLElement;
    void this.act(request.id, async () => {
      await this.friends.accept(request);
      burst(origin);
      this.toasts.success(`You and ${request.fromPlayer.displayName} are friends`);
    });
  }

  protected dismiss(request: FriendRequest): void {
    void this.act(request.id, () => this.friends.dismiss(request));
  }

  protected challenge(friend: Friend): void {
    const profile = friend.profile;
    if (!profile) return;
    void this.act(friend.uid, async () => {
      const code = await this.rooms.challenge(snapshotOf(profile));
      await this.router.navigate(['/room', code]);
    });
  }

  protected remove(friend: Friend): void {
    if (this.removeArmed() !== friend.friendshipId) {
      this.removeArmed.set(friend.friendshipId);
      setTimeout(
        () => this.removeArmed.update((id) => (id === friend.friendshipId ? null : id)),
        3000,
      );
      return;
    }
    void this.act(friend.friendshipId, () => this.friends.remove(friend));
  }
}
