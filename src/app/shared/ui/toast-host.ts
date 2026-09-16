import { Component, inject } from '@angular/core';
import { Toast, ToastAction, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div
      class="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-end gap-3 md:inset-x-auto md:right-6 md:bottom-6"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="panel pointer-events-auto w-full max-w-sm p-4"
          [class.panel-cyan]="toast.tone === 'info' || toast.tone === 'success'"
          [class.panel-pink]="toast.tone === 'error'"
          [class.panel-gold]="toast.tone === 'invite'"
          animate.enter="toast-in"
          animate.leave="toast-out"
          [attr.role]="toast.tone === 'error' ? 'alert' : 'status'"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 text-lg leading-none"
              aria-hidden="true"
              [class]="iconClass(toast)"
              >{{ icon(toast) }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{{ toast.title }}</p>
              @if (toast.message) {
                <p class="mt-1 text-sm text-ink-dim">{{ toast.message }}</p>
              }
              @if (toast.actions?.length) {
                <div class="mt-3 flex flex-wrap gap-2">
                  @for (action of toast.actions; track action.label) {
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class.btn-gold]="action.style !== 'ghost'"
                      [class.btn-ghost]="action.style === 'ghost'"
                      (click)="run(toast, action)"
                    >
                      {{ action.label }}
                    </button>
                  }
                </div>
              }
            </div>
            <button
              type="button"
              class="-mt-1 -mr-1 grid size-8 place-items-center rounded-md text-ink-dim hover:text-ink"
              (click)="toasts.dismiss(toast.id)"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);

  protected icon(toast: Toast): string {
    return { info: '◆', success: '★', error: '!', invite: '♞' }[toast.tone];
  }

  protected iconClass(toast: Toast): string {
    return {
      info: 'text-neon-cyan',
      success: 'text-go',
      error: 'text-neon-pink pixel text-sm',
      invite: 'text-gold',
    }[toast.tone];
  }

  protected run(toast: Toast, action: ToastAction): void {
    this.toasts.dismiss(toast.id);
    action.run();
  }
}
