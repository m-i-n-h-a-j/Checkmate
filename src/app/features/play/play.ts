import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FriendsService } from '../../core/friends/friends.service';
import { Friend, Room, snapshotOf } from '../../core/models';
import { PresenceService } from '../../core/presence/presence.service';
import { ProfileService } from '../../core/profile/profile.service';
import { RoomsService } from '../../core/rooms/rooms.service';
import { ROOM_CODE_LENGTH } from '../../core/util/ids';
import { Avatar } from '../../shared/ui/avatar';
import { CodeInput } from '../../shared/ui/code-input';
import { ToastService } from '../../shared/ui/toast.service';

@Component({
  selector: 'app-play',
  imports: [RouterLink, Avatar, CodeInput],
  templateUrl: './play.html',
})
export class Play {
  protected readonly rooms = inject(RoomsService);
  protected readonly friends = inject(FriendsService);
  protected readonly presence = inject(PresenceService);
  protected readonly profiles = inject(ProfileService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly joinCode = signal('');
  protected readonly joinError = signal(false);
  /** Which action is in flight: 'create', 'join', a friend uid, or a room code. */
  protected readonly busy = signal<string | null>(null);
  protected readonly canJoin = computed(
    () => this.joinCode().length === ROOM_CODE_LENGTH && !this.busy(),
  );
  protected readonly openRoom = computed(() => this.rooms.myRooms()[0] ?? null);

  private async run(key: string, action: () => Promise<string | void>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(key);
    try {
      const code = await action();
      if (code) {
        await this.router.navigate(['/room', code]);
      }
    } catch (error) {
      this.toasts.error(error);
      if (key === 'join') {
        this.joinError.set(true);
        setTimeout(() => this.joinError.set(false), 400);
      }
    } finally {
      this.busy.set(null);
    }
  }

  protected createRoom(): void {
    void this.run('create', () => this.rooms.createCodeRoom());
  }

  protected join(): void {
    if (this.canJoin()) {
      void this.run('join', () => this.rooms.join(this.joinCode()));
    }
  }

  protected challenge(friend: Friend): void {
    const profile = friend.profile;
    if (profile) {
      void this.run(friend.uid, () => this.rooms.challenge(snapshotOf(profile)));
    }
  }

  protected accept(room: Room): void {
    void this.run(room.code, async () => {
      const code = await this.rooms.join(room.code);
      if (room.type === 'rematch') {
        await this.router.navigate(['/room', code]);
        await this.rooms.setReady(code, true);
        return;
      }
      return code;
    });
  }

  protected decline(room: Room): void {
    void this.run(room.code, () => this.rooms.decline(room));
  }
}
