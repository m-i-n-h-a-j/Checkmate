import { Service, signal } from '@angular/core';
import { messageFor } from '../../core/errors';

export interface ToastAction {
  label: string;
  style?: 'primary' | 'ghost';
  run: () => unknown;
}

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error' | 'invite';
  title: string;
  message?: string;
  actions?: ToastAction[];
}

@Service()
export class ToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = signal<Toast[]>([]);

  /** Shows a toast. Pass duration null to keep it until dismissed. */
  show(toast: Omit<Toast, 'id'>, duration: number | null = 4500): number {
    const id = this.nextId++;
    this.toasts.update((list) => [...list.slice(-3), { ...toast, id }]);
    if (duration !== null) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), duration),
      );
    }
    return id;
  }

  success(title: string, message?: string): number {
    return this.show({ tone: 'success', title, message });
  }

  error(error: unknown): number {
    return this.show({ tone: 'error', title: messageFor(error) }, 6000);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}
