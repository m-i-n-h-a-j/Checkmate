import { TimeControl } from '../../core/models';
import { BotColorChoice } from '../../core/bots/bot-game';
import { TIME_CONTROLS } from '../../core/game/time-controls';

export interface BotSettings {
  color: BotColorChoice;
  /** null for untimed. */
  timeControl: TimeControl | null;
}

const SETTINGS_KEY = 'checkmate.botSettings';
const DEFAULTS: BotSettings = { color: 'random', timeControl: null };

export function loadBotSettings(): BotSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<BotSettings>;
    const color = ['white', 'black', 'random'].includes(parsed?.color as string)
      ? (parsed.color as BotColorChoice)
      : DEFAULTS.color;
    const timeControl =
      TIME_CONTROLS.find(
        (option) =>
          option.initial === parsed?.timeControl?.initial &&
          option.increment === parsed?.timeControl?.increment,
      ) ?? null;
    return {
      color,
      timeControl: timeControl
        ? { initial: timeControl.initial, increment: timeControl.increment }
        : null,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveBotSettings(settings: BotSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings last for this visit.
  }
}
