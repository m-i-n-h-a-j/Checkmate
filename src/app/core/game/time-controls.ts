import { TimeControl } from '../models';

export interface TimeControlOption extends TimeControl {
  label: string;
  speed: 'Bullet' | 'Blitz' | 'Rapid' | 'Classical';
}

/** Mirrors the allowed list in firestore.rules. */
export const TIME_CONTROLS: readonly TimeControlOption[] = [
  { initial: 60, increment: 0, label: '1 + 0', speed: 'Bullet' },
  { initial: 180, increment: 2, label: '3 + 2', speed: 'Blitz' },
  { initial: 300, increment: 3, label: '5 + 3', speed: 'Blitz' },
  { initial: 600, increment: 0, label: '10 + 0', speed: 'Rapid' },
  { initial: 900, increment: 10, label: '15 + 10', speed: 'Rapid' },
  { initial: 1800, increment: 0, label: '30 + 0', speed: 'Classical' },
];

export const DEFAULT_TIME_CONTROL: TimeControl = { initial: 600, increment: 0 };

export function sameTimeControl(a: TimeControl, b: TimeControl): boolean {
  return a.initial === b.initial && a.increment === b.increment;
}

export function timeControlOption(control: TimeControl): TimeControlOption {
  return (
    TIME_CONTROLS.find((option) => sameTimeControl(option, control)) ?? {
      ...control,
      label: `${control.initial / 60} + ${control.increment}`,
      speed: 'Rapid',
    }
  );
}
