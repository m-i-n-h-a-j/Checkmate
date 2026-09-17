import { Service, signal } from '@angular/core';

export interface BotRecord {
  wins: number;
  losses: number;
  draws: number;
}

type Records = Readonly<Record<string, BotRecord>>;

const RECORDS_KEY = 'checkmate.botRecords';
const EMPTY: BotRecord = { wins: 0, losses: 0, draws: 0 };

function readRecords(): Records {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const records: Record<string, BotRecord> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, Partial<BotRecord>>)) {
      records[id] = {
        wins: Number(value?.wins) || 0,
        losses: Number(value?.losses) || 0,
        draws: Number(value?.draws) || 0,
      };
    }
    return records;
  } catch {
    return {};
  }
}

/** Wins, losses and draws against each bot, kept on this device. Bot games never touch ratings. */
@Service()
export class BotRecordsService {
  private readonly records = signal<Records>(readRecords());

  recordFor(botId: string): BotRecord {
    return this.records()[botId] ?? EMPTY;
  }

  add(botId: string, outcome: 'win' | 'loss' | 'draw'): void {
    const current = this.recordFor(botId);
    const next: BotRecord = {
      wins: current.wins + (outcome === 'win' ? 1 : 0),
      losses: current.losses + (outcome === 'loss' ? 1 : 0),
      draws: current.draws + (outcome === 'draw' ? 1 : 0),
    };
    this.records.update((records) => ({ ...records, [botId]: next }));
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records()));
    } catch {
      // Storage unavailable: the record lasts for this visit.
    }
  }
}
