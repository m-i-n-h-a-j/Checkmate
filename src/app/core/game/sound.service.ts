import { Service, signal } from '@angular/core';

export type Sound =
  | 'move'
  | 'capture'
  | 'check'
  | 'win'
  | 'lose'
  | 'draw'
  | 'tick'
  | 'shatter'
  | 'boom'
  | 'freeze'
  | 'promote';

interface Note {
  /** Hz, or [from, to] for a slide. For noise, the low-pass cutoff. */
  freq: number | [number, number];
  /** Filtered white noise instead of a tone, for crashes and impacts. */
  noise?: boolean;
  at: number;
  length: number;
  wave?: OscillatorType;
  volume?: number;
}

const STORAGE_KEY = 'checkmate.muted';

/** Chiptune blips synthesized on the fly, so there are no audio files to download. */
const SOUNDS: Record<Sound, Note[]> = {
  move: [{ freq: [720, 560], at: 0, length: 0.06, wave: 'triangle', volume: 0.5 }],
  capture: [
    { freq: [300, 120], at: 0, length: 0.12, wave: 'square', volume: 0.22 },
    { freq: [900, 500], at: 0, length: 0.04, wave: 'triangle', volume: 0.35 },
  ],
  check: [
    { freq: 880, at: 0, length: 0.07, wave: 'square', volume: 0.2 },
    { freq: 1175, at: 0.08, length: 0.1, wave: 'square', volume: 0.2 },
  ],
  win: [523, 659, 784, 1047].map((freq, i) => ({
    freq,
    at: i * 0.09,
    length: i === 3 ? 0.35 : 0.09,
    wave: 'square' as const,
    volume: 0.18,
  })),
  lose: [392, 330, 262].map((freq, i) => ({
    freq,
    at: i * 0.16,
    length: i === 2 ? 0.4 : 0.15,
    wave: 'triangle' as const,
    volume: 0.4,
  })),
  draw: [
    { freq: 523, at: 0, length: 0.12, wave: 'triangle', volume: 0.4 },
    { freq: 523, at: 0.16, length: 0.2, wave: 'triangle', volume: 0.4 },
  ],
  tick: [{ freq: 1400, at: 0, length: 0.03, wave: 'square', volume: 0.12 }],
  shatter: [
    { freq: [6000, 800], at: 0, length: 0.35, noise: true, volume: 0.6 },
    { freq: [320, 90], at: 0, length: 0.22, wave: 'square', volume: 0.25 },
    { freq: [1900, 1200], at: 0.02, length: 0.08, wave: 'triangle', volume: 0.25 },
  ],
  boom: [
    { freq: [140, 38], at: 0, length: 0.7, wave: 'sine', volume: 1 },
    { freq: [2200, 200], at: 0, length: 0.5, noise: true, volume: 0.7 },
  ],
  promote: [
    { freq: [300, 1200], at: 0, length: 0.35, wave: 'sawtooth', volume: 0.12 },
    ...[784, 988, 1175, 1568].map((freq, i) => ({
      freq,
      at: 0.3 + i * 0.07,
      length: i === 3 ? 0.4 : 0.1,
      wave: 'square' as const,
      volume: 0.16,
    })),
  ],
  freeze: [2637, 2093, 1760, 1568, 1319].map((freq, i) => ({
    freq,
    at: i * 0.07,
    length: 0.18,
    wave: 'triangle' as const,
    volume: 0.22,
  })),
};

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

@Service()
export class SoundService {
  private context: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly mutedState = signal(readMuted());
  readonly muted = this.mutedState.asReadonly();

  toggle(): void {
    const muted = !this.mutedState();
    this.mutedState.set(muted);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    if (!muted) this.play('move');
  }

  play(sound: Sound): void {
    if (this.mutedState()) return;
    const context = this.audio();
    if (!context) return;
    if (context.state === 'suspended') {
      // Browsers only allow audio after the viewer has interacted with the page.
      context.resume().catch(() => undefined);
    }
    const start = context.currentTime + 0.01;
    for (const note of SOUNDS[sound]) {
      const gain = context.createGain();
      const [from, to] = typeof note.freq === 'number' ? [note.freq, note.freq] : note.freq;
      const begin = start + note.at;
      const end = begin + note.length;
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(0.25 * (note.volume ?? 0.3), begin + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(context.destination);

      let source: AudioScheduledSourceNode;
      if (note.noise) {
        const noise = context.createBufferSource();
        noise.buffer = this.noise(context);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(from, begin);
        filter.frequency.exponentialRampToValueAtTime(to, end);
        noise.connect(filter).connect(gain);
        source = noise;
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = note.wave ?? 'square';
        oscillator.frequency.setValueAtTime(from, begin);
        if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, end);
        oscillator.connect(gain);
        source = oscillator;
      }
      source.start(begin);
      source.stop(end + 0.02);
    }
  }

  private noise(context: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  private audio(): AudioContext | null {
    if (!this.context && typeof AudioContext !== 'undefined') {
      try {
        this.context = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.context;
  }
}
