import { DOCUMENT, Service, inject, signal } from '@angular/core';
import { EngineStrength } from './bots';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Full strength, for hints. */
export const HINT_STRENGTH: EngineStrength = {
  skill: 20,
  elo: null,
  depth: 14,
  movetime: 1500,
  blunder: 0,
};

const ENGINE_PATH = 'engine/stockfish-19-lite-single.js';

/**
 * Stockfish 19 (lite, single-threaded WebAssembly) in a Web Worker. It downloads the first time a
 * bot game starts, about 1.8 MB, and the service worker keeps it for offline play after that.
 * Single-threaded needs no cross-origin isolation headers, which would break Google's sign-in popup.
 *
 * Searches run one at a time. Starting a new one stops the current search first.
 */
@Service()
export class StockfishService {
  private readonly document = inject(DOCUMENT);
  private worker: Worker | null = null;
  private loading: Promise<void> | null = null;
  private readonly waiters = new Set<(line: string) => boolean>();
  private searching: Promise<unknown> = Promise.resolve();
  private generation = 0;

  readonly status = signal<EngineStatus>('idle');
  /** Download progress of the engine, 0 to 1. */
  readonly progress = signal(0);

  /** Starts the engine if needed. Safe to call any number of times. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.status.set('loading');
    this.loading = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL(ENGINE_PATH, this.document.baseURI));
      } catch (error) {
        reject(error);
        return;
      }
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') return;
        for (const waiter of [...this.waiters]) {
          if (waiter(event.data)) this.waiters.delete(waiter);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        reject(new Error(event.message || 'The chess engine failed to start.'));
      };

      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<{ percent?: number }>) => {
        const percent = event.data?.percent;
        if (typeof percent === 'number') this.progress.set(Math.min(1, Math.max(0, percent)));
      };
      worker.postMessage('setoption name CanOutputEngineDownloadProgress');
      worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);

      this.expect('uciok')
        .then(() => {
          this.send('setoption name Hash value 32');
          return this.expect('readyok', 'isready');
        })
        .then(() => {
          this.progress.set(1);
          resolve();
        }, reject);
      this.send('uci');
    }).then(
      () => this.status.set('ready'),
      (error: unknown) => {
        this.status.set('error');
        this.worker?.terminate();
        this.worker = null;
        this.loading = null;
        throw error;
      },
    );
    return this.loading;
  }

  /** Tells the engine a fresh game started, so it drops what it learned from the last one. */
  newGame(): void {
    if (this.status() === 'ready') this.send('ucinewgame');
  }

  /**
   * The best move for a position, in UCI notation. Returns null when the search was cancelled by a
   * newer one or by `stop()`, or when there is no legal move.
   */
  async bestMove(moves: readonly string[], strength: EngineStrength): Promise<string | null> {
    await this.load();
    const generation = ++this.generation;
    this.send('stop');
    const previous = this.searching;
    const search = previous.then(async () => {
      if (generation !== this.generation) return null;
      this.send(`setoption name Skill Level value ${strength.skill}`);
      this.send(`setoption name UCI_LimitStrength value ${strength.elo !== null}`);
      if (strength.elo !== null) this.send(`setoption name UCI_Elo value ${strength.elo}`);
      this.send(`position startpos${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
      const limits = [
        strength.depth !== null ? `depth ${strength.depth}` : '',
        `movetime ${strength.movetime}`,
      ];
      const line = await this.expect('bestmove', `go ${limits.filter(Boolean).join(' ')}`);
      const move = line.split(/\s+/)[1];
      if (generation !== this.generation || !move || move === '(none)') return null;
      return move;
    });
    this.searching = search.catch(() => null);
    return search;
  }

  /** Cancels any search in progress. */
  stop(): void {
    this.generation++;
    if (this.worker) this.send('stop');
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  /** Resolves with the first engine line starting with `prefix`, optionally sending a command first. */
  private expect(prefix: string, command?: string): Promise<string> {
    return new Promise((resolve) => {
      this.waiters.add((line) => {
        if (!line.startsWith(prefix)) return false;
        resolve(line);
        return true;
      });
      if (command) this.send(command);
    });
  }
}
