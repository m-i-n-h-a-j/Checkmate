import { Timestamp } from 'firebase/firestore';

export function millis(value: Timestamp | null | undefined): number | null {
  return value ? value.toMillis() : null;
}

/** "just now", "5m ago", "3h ago", "2d ago" */
export function timeAgo(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

/** Match clock, e.g. "4:07" or "1:02:33". */
export function clock(from: number, now: number): string {
  const total = Math.max(0, Math.floor((now - from) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
