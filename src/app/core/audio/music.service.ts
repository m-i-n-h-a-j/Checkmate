import { DOCUMENT, Service, effect, inject, signal, untracked } from '@angular/core';
import { SoundService } from '../game/sound.service';

/** The moments that have their own music. Loops play under the game; stings play once at the end. */
export type MusicCue = 'win' | 'loss' | 'tension' | 'time';

export interface Scene {
  /** False once the game is over, so the loops stop. */
  live: boolean;
  /** Material left on the board in pawns, from `materialLeft()`. */
  material: number;
  /** The listener's own time left in ms, or null when the game has no clock. */
  timeLeftMs: number | null;
}

const STORAGE_KEY = 'checkmate.music';
/** Both sides down to roughly a rook and a couple of pawns: the endgame, where games are decided. */
const ENDGAME_MATERIAL = 24;
const LOW_TIME_MS = 30_000;
const LOOP_VOLUME = 0.26;
const STING_VOLUME = 0.45;
const FADE_STEP_MS = 50;
/** Loops ease in slowly enough that they feel like part of the room, not a track starting. */
const LOOP_IN_MS = 2600;
const LOOP_OUT_MS = 1300;
/** A cue has to hold this long before it plays, so a moment that passes in a blink stays silent. */
const SETTLE_MS = 1500;
/** Once the clock loop is on it takes a comfortable margin, not one second, to turn it off. */
const LOW_TIME_CLEAR_MS = 45_000;

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Music for the moments that deserve it: a tense loop once a game reaches the endgame, a faster one
 * when the clock runs low, and a sting when the game is won or lost. Everything else stays on the
 * chiptune blips in `SoundService`.
 *
 * Music is on by default and can be switched off on its own; muting all sound silences it too.
 * Tracks are only fetched when a game first needs them.
 */
@Service()
export class MusicService {
  private readonly sounds = inject(SoundService);
  private readonly document = inject(DOCUMENT);
  private readonly tracks = new Map<MusicCue, HTMLAudioElement>();
  private readonly fades = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>();

  private readonly onState = signal(readSetting());
  /** True when music may play. */
  readonly on = this.onState.asReadonly();

  private readonly loopState = signal<MusicCue | null>(null);
  private settling: ReturnType<typeof setTimeout> | undefined;
  /** The loop playing right now, if any. */
  readonly cue = this.loopState.asReadonly();
  private sting: HTMLAudioElement | null = null;
  private format: 'opus' | 'm4a' | null = null;
  private prepared = false;

  constructor() {
    effect(() => {
      const allowed = this.onState() && !this.sounds.muted();
      if (!allowed) untracked(() => this.stop());
    });
    // A loop playing into a hidden tab is just noise from nowhere.
    this.document.addEventListener('visibilitychange', () => {
      const loop = this.loopState();
      const playing = loop && this.tracks.get(loop);
      if (!playing) return;
      if (this.document.visibilityState === 'hidden') {
        this.fade(playing, 0, 400, () => playing.pause());
      } else {
        playing.volume = 0;
        this.start(playing);
        this.fade(playing, LOOP_VOLUME, LOOP_IN_MS);
      }
    });
  }

  toggle(): void {
    const on = !this.onState();
    this.onState.set(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  }

  /** Fetches the stings ahead of time so a win or loss isn't followed by silence while it loads. */
  private prepare(): void {
    if (this.prepared || !this.allowed()) return;
    this.prepared = true;
    this.track('win').load();
    this.track('loss').load();
  }

  /** Follows the game: picks the loop that fits, or none. */
  scene({ live, material, timeLeftMs }: Scene): void {
    if (!this.allowed()) return;
    if (live) this.prepare();
    // The clock cue holds until there is real time again, so an increment can't flap it on and off.
    const lowTime =
      timeLeftMs !== null &&
      timeLeftMs < (this.loopState() === 'time' ? LOW_TIME_CLEAR_MS : LOW_TIME_MS);
    const wanted: MusicCue | null = !live
      ? null
      : lowTime
        ? 'time'
        : material <= ENDGAME_MATERIAL
          ? 'tension'
          : null;
    this.setLoop(wanted);
  }

  /** Plays a one-off cue over the ending, and stops the loops. */
  play(cue: 'win' | 'loss'): void {
    if (!this.allowed()) return;
    this.setLoop(null, 700);
    const track = this.track(cue);
    this.stopSting();
    this.sting = track;
    track.loop = false;
    track.currentTime = 0;
    track.volume = STING_VOLUME;
    this.start(track);
  }

  /** Silences everything, e.g. when leaving a game. */
  stop(): void {
    this.setLoop(null, 700);
    this.stopSting();
  }

  /** Playback is refused until the viewer has interacted with the page, which is fine to ignore. */
  private start(track: HTMLAudioElement): void {
    try {
      void track.play()?.catch(() => undefined);
    } catch {
      // Some browsers throw instead of rejecting.
    }
  }

  private allowed(): boolean {
    return this.onState() && !this.sounds.muted();
  }

  private setLoop(cue: MusicCue | null, fadeOutMs = LOOP_OUT_MS): void {
    if (this.loopState() === cue) return;
    const current = this.loopState();
    const previous = current ? this.tracks.get(current) : undefined;
    this.loopState.set(cue);
    clearTimeout(this.settling);
    if (previous) {
      this.fade(previous, 0, fadeOutMs, () => previous.pause());
    }
    if (!cue) return;
    // Wait out the moment before playing: a cue that came and went isn't worth interrupting for.
    this.settling = setTimeout(() => {
      if (this.loopState() !== cue || !this.allowed()) return;
      const track = this.track(cue);
      track.loop = true;
      track.volume = 0;
      this.start(track);
      this.fade(track, LOOP_VOLUME, LOOP_IN_MS);
    }, SETTLE_MS);
  }

  private stopSting(): void {
    const sting = this.sting;
    if (!sting) return;
    this.sting = null;
    this.fade(sting, 0, 700, () => sting.pause());
  }

  private track(cue: MusicCue): HTMLAudioElement {
    let track = this.tracks.get(cue);
    if (!track) {
      track = new Audio(`audio/${cue}.${this.extension()}`);
      track.preload = 'auto';
      this.tracks.set(cue, track);
    }
    return track;
  }

  /** Opus where it plays, AAC for the browsers without it. */
  private extension(): 'opus' | 'm4a' {
    if (!this.format) {
      const probe = this.document.createElement('audio');
      this.format = probe.canPlayType('audio/ogg; codecs=opus') ? 'opus' : 'm4a';
    }
    return this.format;
  }

  private fade(track: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
    clearInterval(this.fades.get(track));
    const from = track.volume;
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let step = 0;
    const timer = setInterval(() => {
      step++;
      // Ease in and out rather than ramp: a straight line is audible as a fade, a curve isn't.
      const eased = (1 - Math.cos((Math.PI * step) / steps)) / 2;
      track.volume = Math.min(1, Math.max(0, from + (to - from) * eased));
      if (step < steps) return;
      clearInterval(timer);
      this.fades.delete(track);
      done?.();
    }, FADE_STEP_MS);
    this.fades.set(track, timer);
  }
}
