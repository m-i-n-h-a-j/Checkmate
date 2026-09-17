import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BotRecordsService } from '../../core/bots/bot-records.service';
import { BotColorChoice, loadBotGame, newBotGame, saveBotGame } from '../../core/bots/bot-game';
import { BOTS, Bot, botAvatar, botById } from '../../core/bots/bots';
import { TIME_CONTROLS, TimeControlOption } from '../../core/game/time-controls';
import { StockfishService } from '../../core/bots/stockfish.service';
import { Avatar } from '../../shared/ui/avatar';
import { Icon } from '../../shared/ui/icon';
import { BotSettings, loadBotSettings, saveBotSettings } from './bot-settings';

const COLORS: { value: BotColorChoice; label: string; icon: string }[] = [
  { value: 'white', label: 'White', icon: '♔' },
  { value: 'random', label: 'Random', icon: '?' },
  { value: 'black', label: 'Black', icon: '♚' },
];

/** The bot ladder: pick an opponent, a color and a clock. */
@Component({
  selector: 'app-bots',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './bots.html',
  styles: `
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      min-height: 3.5rem;
      padding: 0.45rem 0.25rem;
      border: 2px solid var(--color-line);
      border-radius: 10px;
      background: rgb(10 6 18 / 0.6);
      cursor: pointer;
      transition:
        border-color 120ms,
        background-color 120ms;
    }
    .tile:hover {
      border-color: rgb(34 240 255 / 0.6);
    }
    .tile-on {
      border-color: var(--color-gold);
      background: rgb(255 201 74 / 0.12);
      color: var(--color-gold);
    }
    .tile:has(input:focus-visible) {
      outline: 2px solid var(--color-neon-cyan);
      outline-offset: 3px;
    }
    .bot-card {
      border-color: color-mix(in srgb, var(--bot) 45%, var(--color-line));
    }
    .bot-card:hover,
    .bot-card:focus-within {
      border-color: var(--bot);
      box-shadow: 0 0 28px -12px var(--bot);
    }
  `,
})
export class Bots {
  private readonly router = inject(Router);
  private readonly engine = inject(StockfishService);
  protected readonly records = inject(BotRecordsService);

  protected readonly bots = BOTS;
  protected readonly colors = COLORS;
  protected readonly timeControls = TIME_CONTROLS;
  protected readonly avatar = botAvatar;

  protected readonly settings = signal<BotSettings>(loadBotSettings());
  protected readonly current = signal(loadBotGame());
  protected readonly currentBot = computed(() => {
    const game = this.current();
    return game?.status === 'live' ? botById(game.botId) : null;
  });
  /** The bot whose Play button is waiting for a second tap to replace the game in progress. */
  protected readonly armed = signal<string | null>(null);
  private disarm: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Start the download early: players usually pick a bot within seconds.
    this.engine.load().catch(() => undefined);
  }

  protected isTime(option: TimeControlOption | null): boolean {
    const current = this.settings().timeControl;
    return option === null
      ? current === null
      : current?.initial === option.initial && current?.increment === option.increment;
  }

  protected setColor(color: BotColorChoice): void {
    this.update({ ...this.settings(), color });
  }

  protected setTime(option: TimeControlOption | null): void {
    const timeControl = option ? { initial: option.initial, increment: option.increment } : null;
    this.update({ ...this.settings(), timeControl });
  }

  protected play(bot: Bot): void {
    const inProgress = this.currentBot() && (this.current()?.moves.length ?? 0) > 0;
    if (inProgress && this.armed() !== bot.id) {
      this.armed.set(bot.id);
      clearTimeout(this.disarm);
      this.disarm = setTimeout(() => this.armed.set(null), 3000);
      return;
    }
    const { color, timeControl } = this.settings();
    saveBotGame(newBotGame(bot.id, color, timeControl, Date.now()));
    void this.router.navigateByUrl('/bots/play');
  }

  protected playLabel(bot: Bot): string {
    return this.armed() === bot.id ? 'Tap again: new game' : `Play ${bot.name}`;
  }

  private update(settings: BotSettings): void {
    this.settings.set(settings);
    saveBotSettings(settings);
  }
}
