import {
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MusicService } from '../../core/audio/music.service';
import { AuthService } from '../../core/auth/auth.service';
import { ChessReplay, PlayedMove } from '../../core/game/chess-game';
import { FREE_PLIES, flaggedSide, readClocks } from '../../core/game/clock';
import { GameService } from '../../core/game/game.service';
import { materialLeft, opposite, parseUci } from '../../core/game/notation';
import { ServerClock } from '../../core/game/server-clock.service';
import { SoundService } from '../../core/game/sound.service';
import { timeControlOption } from '../../core/game/time-controls';
import { PlayerSnapshot, Room, Side } from '../../core/models';
import { ProfileService } from '../../core/profile/profile.service';
import { EffectsService } from '../../core/settings/effects.service';
import { BoardMove, Chessboard } from '../../shared/chess/chessboard';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { BoardFx } from './board-fx';
import { GameControls } from './game-controls';
import { GameMoments } from './game-moments';
import { GameOver } from './game-over';
import { MoveInput } from './move-input';
import { MoveList } from './move-list';
import { PlayerStrip } from './player-strip';

const MAX_CLAIM_BACKOFF_MS = 30_000;
const FLAG_GRACE_MS = 400;

/** A live or finished game: board, clocks, moves and controls, for players and spectators alike. */
@Component({
  selector: 'app-game-view',
  imports: [Chessboard, BoardFx, PlayerStrip, MoveList, MoveInput, GameControls, GameOver, Icon],
  templateUrl: './game-view.html',
  host: { class: 'block' },
})
export class GameView {
  private readonly auth = inject(AuthService);
  private readonly games = inject(GameService);
  private readonly serverClock = inject(ServerClock);
  private readonly toasts = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  protected readonly sounds = inject(SoundService);
  protected readonly effects = inject(EffectsService);
  protected readonly music = inject(MusicService);

  readonly room = input.required<Room>();
  /** 'play' lets a seated player move; 'watch' always spectates. */
  readonly mode = input<'play' | 'watch'>('play');

  private readonly board = viewChild(Chessboard);
  private readonly fx = viewChild(BoardFx);
  private readonly moveInput = viewChild(MoveInput);

  private readonly replay = new ChessReplay();
  protected readonly position = computed(() => this.replay.sync(this.room().moves));

  protected readonly legacy = computed(() => !this.room().whiteUid || !this.room().blackUid);
  protected readonly live = computed(() => this.room().status === 'live');
  protected readonly speed = computed(() => timeControlOption(this.room().timeControl));

  protected readonly mySide = computed<Side | null>(() => {
    const uid = this.auth.uid();
    const room = this.room();
    if (this.mode() === 'watch' || !uid) return null;
    return uid === room.whiteUid ? 'white' : uid === room.blackUid ? 'black' : null;
  });
  protected readonly flipped = signal(false);
  protected readonly orientation = computed<Side>(() => {
    const base = this.mySide() ?? 'white';
    return this.flipped() ? opposite(base) : base;
  });

  private readonly finishing = signal(false);
  protected readonly myTurn = computed(
    () =>
      this.live() &&
      this.mySide() === this.position().turn &&
      this.position().validPlies === this.room().moves.length,
  );
  protected readonly canMove = computed(() => this.myTurn() && !this.finishing());

  private readonly profiles = inject(ProfileService);
  private readonly whiteProfile = this.profiles.watch(() => this.room().whiteUid);
  private readonly blackProfile = this.profiles.watch(() => this.room().blackUid);

  /** Server time, refreshed whenever a clock's display would change. */
  private readonly now = signal(this.serverClock.now());
  protected readonly clocks = computed(() => readClocks(this.room(), this.now()));

  protected readonly strips = computed(() => {
    const bottom = this.orientation();
    return [this.strip(opposite(bottom)), this.strip(bottom)] as const;
  });

  protected readonly status = computed(() => {
    const room = this.room();
    const position = this.position();
    const side = this.mySide();
    if (this.legacy()) return '';
    if (room.status !== 'live') return 'Game over';
    if (position.validPlies < room.moves.length)
      return 'This game has an illegal move and is stuck.';
    const mover = this.nameOf(position.turn);
    const check = position.check ? 'Check! ' : '';
    if (room.moves.length < FREE_PLIES) {
      const first = side === position.turn ? 'Your first move' : `${mover}'s first move`;
      return `${check}${first}. Clocks start after both players move.`;
    }
    if (side) return `${check}${side === position.turn ? 'Your move' : `Waiting for ${mover}`}`;
    return `${check}${mover} to move`;
  });

  protected readonly moveHint = computed(() => {
    if (!this.live()) return '';
    return this.canMove() ? 'Your move.' : 'Waiting for your opponent.';
  });

  protected readonly moments = new GameMoments({
    fx: () => this.fx(),
    nameOf: (side) => this.nameOf(side),
    mySide: () => this.mySide(),
    resultSelector: 'app-game-over h2',
  });
  protected readonly copied = signal(false);

  private claimDelay = 0;
  private claiming = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Tick the clocks exactly when the running one's display changes.
    effect((onCleanup) => {
      const room = this.room();
      if (room.status !== 'live' || room.moves.length < FREE_PLIES) {
        untracked(() => this.now.set(this.serverClock.now()));
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = () => {
        const now = this.serverClock.now();
        this.now.set(now);
        const reading = readClocks(room, now);
        const left = reading.running ? reading[reading.running] : 1000;
        const step = left <= 0 ? 200 : left < 10_000 ? (left % 100) + 5 : (left % 1000) + 5;
        timer = setTimeout(tick, step);
      };
      untracked(tick);
      onCleanup(() => clearTimeout(timer));
    });

    // Call the flag once the side to move is out of time. The rules judge by server time, so wait a
    // moment past zero rather than send a claim this device's clock estimate might get refused.
    effect(() => {
      const room = this.room();
      const now = this.now();
      if (!this.mySide() || this.claiming || !flaggedSide(room, now - FLAG_GRACE_MS)) return;
      untracked(() => void this.claimFlag(room));
    });

    // Sounds, effects, announcements and the result screen follow the game as it changes.
    effect(() => {
      const room = this.room();
      const position = this.position();
      untracked(() =>
        this.moments.follow({
          plies: room.moves.length,
          status: room.status === 'live' ? 'live' : 'finished',
          position,
          result: room.result,
          reason: room.reason,
        }),
      );
    });

    // Music follows the shape of the game: the endgame loop, then the clock.
    effect(() => {
      const room = this.room();
      const clocks = this.clocks();
      const position = this.position();
      const side = this.mySide();
      untracked(() =>
        this.music.scene({
          live: room.status === 'live',
          material: materialLeft(position.fen),
          timeLeftMs: side ? clocks[side] : Math.min(clocks.white, clocks.black),
        }),
      );
    });

    destroyRef.onDestroy(() => {
      this.claiming = true;
      this.music.stop();
    });
  }

  protected onBoardMove(move: BoardMove): void {
    this.position();
    this.play(this.replay.preview(move));
  }

  protected onTypedMove(text: string): void {
    this.position();
    const uci = parseUci(text.toLowerCase());
    const played = (uci ? this.replay.preview(uci) : null) ?? this.replay.preview(text);
    if (!played || !this.canMove()) {
      this.moveInput()?.reject(text);
      return;
    }
    this.moveInput()?.accept();
    this.play(played);
  }

  protected flip(): void {
    this.flipped.update((flipped) => !flipped);
  }

  protected async copyWatchLink(): Promise<void> {
    const link = `${this.document.location.origin}/watch/${this.room().code}`;
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.toasts.show({ tone: 'error', title: `Couldn't copy. The link is ${link}` });
    }
  }

  private play(played: PlayedMove | null): void {
    const room = this.room();
    if (!played || !this.canMove()) {
      this.board()?.reset();
      return;
    }
    this.moments.playedLocally(room.moves.length + 1, played.san, played.captured);
    if (played.outcome) this.finishing.set(true);
    this.games
      .move(room, played)
      .catch((error: unknown) => {
        this.toasts.error(error);
        this.board()?.reset();
      })
      .finally(() => this.finishing.set(false));
  }

  private async claimFlag(room: Room): Promise<void> {
    this.claiming = true;
    try {
      const done = await this.games.claimTimeout(room);
      if (done) return;
    } catch {
      // Usually the server clock disagrees by a moment. Try again shortly.
    }
    this.claimDelay = Math.min(MAX_CLAIM_BACKOFF_MS, Math.max(1500, this.claimDelay * 2));
    await new Promise((resolve) => setTimeout(resolve, this.claimDelay));
    this.claiming = false;
    this.now.set(this.serverClock.now());
  }

  private playerOf(side: Side): PlayerSnapshot | null {
    const room = this.room();
    const uid = side === 'white' ? room.whiteUid : room.blackUid;
    if (uid && uid === room.hostUid) return room.host;
    if (uid && uid === room.guestUid) return room.guest;
    return null;
  }

  protected nameOf(side: Side): string {
    return this.playerOf(side)?.displayName ?? (side === 'white' ? 'White' : 'Black');
  }

  private strip(side: Side) {
    const room = this.room();
    const position = this.position();
    const clocks = this.clocks();
    const lead = side === 'white' ? position.material : -position.material;
    return {
      side,
      player: this.playerOf(side),
      profile: side === 'white' ? this.whiteProfile() : this.blackProfile(),
      you: this.mySide() === side,
      clockMs: this.legacy() ? null : clocks[side],
      running: clocks.running === side,
      imbalance: position.imbalance[side],
      lead: Math.max(0, lead),
      ratingDiff: side === 'white' ? room.whiteRatingDiff : room.blackRatingDiff,
    };
  }
}
