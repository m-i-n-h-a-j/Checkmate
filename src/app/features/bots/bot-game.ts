import {
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  BotGame,
  botFlagged,
  loadBotGame,
  newBotGame,
  pauseBotGame,
  readBotClocks,
  resumeBotGame,
  saveBotGame,
  withMove,
  withResult,
  withTakeback,
} from '../../core/bots/bot-game';
import { BotRecordsService } from '../../core/bots/bot-records.service';
import { BOTS, Bot, botById, botPlayer } from '../../core/bots/bots';
import { HINT_STRENGTH, StockfishService } from '../../core/bots/stockfish.service';
import { ChessReplay, PlayedMove } from '../../core/game/chess-game';
import { FREE_PLIES } from '../../core/game/clock';
import { hasBareKing, opposite, parseUci } from '../../core/game/notation';
import { SoundService } from '../../core/game/sound.service';
import { timeControlOption } from '../../core/game/time-controls';
import { PlayerSnapshot, Side } from '../../core/models';
import { ProfileService } from '../../core/profile/profile.service';
import { EffectsService } from '../../core/settings/effects.service';
import { BoardMove, Chessboard } from '../../shared/chess/chessboard';
import { Icon } from '../../shared/ui/icon';
import { BoardFx } from '../game/board-fx';
import { GameMoments } from '../game/game-moments';
import { MoveInput } from '../game/move-input';
import { MoveList } from '../game/move-list';
import { PlayerStrip } from '../game/player-strip';
import { BotResult } from './bot-result';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** A gold pawn for players who aren't signed in. */
const GUEST_AVATAR = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">' +
    '<rect width="32" height="32" fill="#140b24"/><g fill="#ffc94a">' +
    '<rect x="13" y="6" width="6" height="6"/><rect x="12" y="13" width="8" height="2"/>' +
    '<rect x="13" y="15" width="6" height="7"/><rect x="10" y="22" width="12" height="2"/>' +
    '<rect x="8" y="24" width="16" height="3"/></g></svg>',
)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A game against a bot, played entirely on this device. */
@Component({
  selector: 'app-bot-game',
  imports: [Chessboard, BoardFx, PlayerStrip, MoveList, MoveInput, BotResult, Icon],
  templateUrl: './bot-game.html',
})
export class BotGamePage {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly records = inject(BotRecordsService);
  private readonly profiles = inject(ProfileService);
  protected readonly engine = inject(StockfishService);
  protected readonly sounds = inject(SoundService);
  protected readonly effects = inject(EffectsService);

  private readonly board = viewChild(Chessboard);
  private readonly fx = viewChild(BoardFx);
  private readonly moveInput = viewChild(MoveInput);

  protected readonly game = signal<BotGame | null>(loadBotGame());
  protected readonly bot = computed(() => botById(this.game()?.botId));
  protected readonly nextBot = computed(() => {
    const bot = this.bot();
    const index = bot ? BOTS.indexOf(bot) : -1;
    return index >= 0 ? (BOTS[index + 1] ?? null) : null;
  });

  private readonly replay = new ChessReplay();
  protected readonly position = computed(() => this.replay.sync(this.game()?.moves ?? []));

  protected readonly mySide = computed<Side>(() => this.game()?.playerColor ?? 'white');
  protected readonly botSide = computed(() => opposite(this.mySide()));
  protected readonly live = computed(() => this.game()?.status === 'live');
  protected readonly flipped = signal(false);
  protected readonly orientation = computed(() =>
    this.flipped() ? this.botSide() : this.mySide(),
  );

  protected readonly thinking = signal(false);
  protected readonly myTurn = computed(
    () => this.live() && this.position().turn === this.mySide() && !this.thinking(),
  );
  protected readonly hint = signal<readonly [string, string] | null>(null);
  protected readonly hinting = signal(false);
  protected readonly resignArmed = signal(false);
  protected readonly firstWin = signal(false);

  protected readonly speed = computed(() => {
    const control = this.game()?.timeControl;
    return control
      ? `${timeControlOption(control).label} · ${timeControlOption(control).speed}`
      : 'Untimed';
  });

  protected readonly progressPercent = computed(() => Math.round(this.engine.progress() * 100));

  private readonly now = signal(Date.now());
  protected readonly clocks = computed(() => {
    const game = this.game();
    return game ? readBotClocks(game, this.now()) : { white: 0, black: 0, running: null };
  });

  protected readonly canTakeBack = computed(() => {
    const game = this.game();
    if (!game || !this.live()) return false;
    // Always give the turn back to the player, undoing at least one of their own moves.
    return this.position().turn === this.botSide()
      ? game.moves.length >= 1
      : game.moves.length >= 2;
  });

  protected readonly status = computed(() => {
    const bot = this.bot();
    const position = this.position();
    if (!bot || !this.live()) return '';
    const engine = this.engine.status();
    if (engine === 'error') return `${bot.name} couldn't start.`;
    if (position.turn === this.botSide()) {
      if (engine !== 'ready') {
        return `Waking up ${bot.name}… ${this.progressPercent()}%`;
      }
      return `${bot.name} is thinking…`;
    }
    const check = position.check ? 'Check! ' : '';
    const clocks = this.game()!.timeControl && this.game()!.moves.length < FREE_PLIES;
    return `${check}Your move${clocks ? '. Clocks start after both sides move.' : ''}`;
  });

  protected readonly moments = new GameMoments({
    fx: () => this.fx(),
    nameOf: (side) => this.nameOf(side),
    mySide: () => this.mySide(),
    resultSelector: 'app-bot-result h2',
    secondPerson: true,
  });

  protected readonly strips = computed(() => {
    const bottom = this.orientation();
    return [this.strip(opposite(bottom)), this.strip(bottom)] as const;
  });

  private botToken = 0;
  private resignTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);
    if (!this.game() || !this.bot()) {
      void this.router.navigateByUrl('/bots', { replaceUrl: true });
      return;
    }

    // A game loaded from storage was paused when the page closed. Restart its clock from now.
    this.game.update((game) => game && resumeBotGame({ ...game, turnStartedAt: null }, Date.now()));
    this.engine.load().catch(() => undefined);
    this.engine.newGame();

    effect(() => saveBotGame(this.game()));

    // The bot only waits while the page is visible, so its clocks pause too.
    const onVisibility = () => {
      const now = Date.now();
      this.game.update(
        (game) =>
          game &&
          (this.document.visibilityState === 'hidden'
            ? pauseBotGame(game, now)
            : resumeBotGame(game, now)),
      );
    };
    this.document.addEventListener('visibilitychange', onVisibility);

    // Tick the clocks exactly when the running one's display changes, and call the flag.
    effect((onCleanup) => {
      const game = this.game();
      if (!game || game.status !== 'live' || game.turnStartedAt === null) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = () => {
        const now = Date.now();
        this.now.set(now);
        const current = this.game();
        if (current && botFlagged(current, now)) {
          this.flag(current, now);
          return;
        }
        const reading = current ? readBotClocks(current, now) : null;
        const left = reading?.running ? reading[reading.running] : 1000;
        timer = setTimeout(tick, left < 10_000 ? (left % 100) + 5 : (left % 1000) + 5);
      };
      untracked(tick);
      onCleanup(() => clearTimeout(timer));
    });

    // The bot moves whenever it's its turn and the engine is up.
    effect(() => {
      const game = this.game();
      const turn = this.position().turn;
      const ready = this.engine.status() === 'ready';
      if (!game || game.status !== 'live' || turn !== this.botSide() || !ready) return;
      untracked(() => void this.botMove(game.moves.length));
    });

    effect(() => {
      const game = this.game();
      const position = this.position();
      if (!game) return;
      untracked(() =>
        this.moments.follow({
          plies: game.moves.length,
          status: game.status,
          position,
          result: game.result,
          reason: game.reason,
        }),
      );
    });

    destroyRef.onDestroy(() => {
      this.botToken++;
      this.engine.stop();
      clearTimeout(this.resignTimer);
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.game.update((game) => game && pauseBotGame(game, Date.now()));
      saveBotGame(this.game());
    });
  }

  protected nameOf(side: Side): string {
    return side === this.mySide() ? 'You' : (this.bot()?.name ?? 'Bot');
  }

  protected onBoardMove(move: BoardMove): void {
    this.position();
    this.playerMove(this.replay.preview(move));
  }

  protected onTypedMove(text: string): void {
    this.position();
    const uci = parseUci(text.toLowerCase());
    const played = (uci ? this.replay.preview(uci) : null) ?? this.replay.preview(text);
    if (!played || !this.myTurn()) {
      this.moveInput()?.reject(text);
      return;
    }
    this.moveInput()?.accept();
    this.playerMove(played);
  }

  protected flip(): void {
    this.flipped.update((flipped) => !flipped);
  }

  protected async showHint(): Promise<void> {
    const game = this.game();
    if (!game || !this.myTurn() || this.hinting()) return;
    this.hinting.set(true);
    try {
      const move = await this.engine.bestMove(game.moves, HINT_STRENGTH);
      const parsed = move ? parseUci(move) : null;
      if (parsed && this.game()?.moves.length === game.moves.length) {
        this.hint.set([parsed.from, parsed.to]);
        this.game.update((current) => current && { ...current, hints: current.hints + 1 });
      }
    } catch {
      // The engine failed; the status line already says so.
    } finally {
      this.hinting.set(false);
    }
  }

  protected takeBack(): void {
    const game = this.game();
    if (!game || !this.canTakeBack()) return;
    this.cancelBot();
    const plies = this.position().turn === this.botSide() ? 1 : 2;
    this.hint.set(null);
    this.game.set(withTakeback(game, plies, Date.now()));
  }

  protected resign(): void {
    const game = this.game();
    if (!game || !this.live()) return;
    if (!this.resignArmed()) {
      this.resignArmed.set(true);
      clearTimeout(this.resignTimer);
      this.resignTimer = setTimeout(() => this.resignArmed.set(false), 3000);
      return;
    }
    this.resignArmed.set(false);
    this.cancelBot();
    this.finish(withResult(game, this.botSide(), 'resign', Date.now()));
  }

  protected retryEngine(): void {
    this.engine.load().catch(() => undefined);
  }

  protected playAgain(bot?: Bot): void {
    const game = this.game();
    const target = bot ?? this.bot();
    if (!game || !target) return;
    this.cancelBot();
    this.moments.reset();
    this.hint.set(null);
    this.firstWin.set(false);
    this.flipped.set(false);
    this.engine.newGame();
    this.game.set(newBotGame(target.id, game.colorChoice, game.timeControl, Date.now()));
  }

  private playerMove(played: PlayedMove | null): void {
    const game = this.game();
    if (!game || !played || !this.myTurn()) {
      this.board()?.reset();
      return;
    }
    this.hint.set(null);
    this.moments.playedLocally(game.moves.length + 1, played.san, played.captured);
    this.apply(game, played);
  }

  private async botMove(plies: number): Promise<void> {
    const bot = this.bot();
    const game = this.game();
    if (!bot || !game || this.thinking()) return;
    const token = ++this.botToken;
    this.thinking.set(true);
    const started = Date.now();
    try {
      let uci = await this.engine.bestMove(game.moves, bot.strength);
      if (token !== this.botToken) return;
      const legal = this.position().legal;
      if (legal.length && (!uci || Math.random() < bot.strength.blunder)) {
        uci = this.replay.preview(legal[Math.floor(Math.random() * legal.length)])?.uci ?? uci;
      }
      // Think for a human-feeling moment, but never burn much of a short clock doing it.
      const clock = game.timeControl ? readBotClocks(game, Date.now())[this.botSide()] : Infinity;
      const pause = Math.min(rand(...bot.think), clock / 40) - (Date.now() - started);
      if (pause > 0) await wait(pause);
      const current = this.game();
      if (token !== this.botToken || !current || current.moves.length !== plies || !uci) return;
      const parsed = parseUci(uci);
      const played = parsed ? this.replay.preview(parsed) : null;
      if (played) this.apply(current, played);
    } catch {
      // The engine failed; the status line offers a retry.
    } finally {
      if (token === this.botToken) this.thinking.set(false);
    }
  }

  private apply(game: BotGame, played: PlayedMove): void {
    const now = Date.now();
    let next = withMove(game, played.uci, now);
    // A move landing while the tab is hidden (the bot's, usually) mustn't start the other clock.
    if (this.document.visibilityState === 'hidden') next = pauseBotGame(next, now);
    if (played.outcome) {
      next = withResult(next, played.outcome.result, played.outcome.reason, now);
      this.finish(next);
      return;
    }
    this.game.set(next);
  }

  /** Ends the game on time. A side with only its king left can't win, so that's a draw. */
  private flag(game: BotGame, now: number): void {
    const flagged = botFlagged(game, now);
    if (!flagged) return;
    this.cancelBot();
    const winner = opposite(flagged);
    const draw = hasBareKing(this.position().fen, winner);
    this.finish(withResult(game, draw ? 'draw' : winner, 'timeout', now));
  }

  private finish(game: BotGame): void {
    const bot = this.bot();
    if (bot && game.result) {
      const outcome =
        game.result === 'draw' ? 'draw' : game.result === game.playerColor ? 'win' : 'loss';
      this.firstWin.set(outcome === 'win' && this.records.recordFor(bot.id).wins === 0);
      this.records.add(bot.id, outcome);
    }
    this.hint.set(null);
    this.game.set(game);
  }

  private cancelBot(): void {
    this.botToken++;
    this.thinking.set(false);
    this.engine.stop();
  }

  private strip(side: Side) {
    const position = this.position();
    const clocks = this.clocks();
    const bot = this.bot();
    const lead = side === 'white' ? position.material : -position.material;
    const mine = side === this.mySide();
    const profile = this.profiles.profile();
    const me: PlayerSnapshot = profile ?? {
      uid: 'me',
      displayName: 'You',
      username: null,
      photoURL: GUEST_AVATAR,
    };
    return {
      side,
      player: mine ? me : bot ? botPlayer(bot) : null,
      you: mine,
      ratingLabel: !mine && bot ? `≈${bot.rating}` : null,
      clockMs: this.game()?.timeControl ? clocks[side] : null,
      running: clocks.running === side,
      imbalance: position.imbalance[side],
      lead: Math.max(0, lead),
    };
  }
}
