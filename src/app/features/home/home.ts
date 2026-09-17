import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { RoomsService } from '../../core/rooms/rooms.service';
import { GoogleMark } from '../../shared/ui/google-mark';
import { MatchCard } from '../../shared/ui/match-card';
import { ToastService } from '../../shared/ui/toast.service';
import { HomeSky } from './home-sky';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatchCard, GoogleMark, HomeSky],
  templateUrl: './home.html',
})
export class Home {
  protected readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  protected readonly live = inject(RoomsService).liveRooms();

  /** Set by the auth guard when a guest tries to play. */
  readonly signin = input<string>();

  protected readonly letters = 'CHECKMATE'.split('');
  /** The one tube in the sign that never quite behaves. */
  protected readonly faultyLetter = 5;

  protected async signIn(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.toasts.error(error);
    }
  }
}
