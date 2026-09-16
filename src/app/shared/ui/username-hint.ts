import { Component, input } from '@angular/core';
import { UsernameStatus } from '../../core/profile/username-check';

@Component({
  selector: 'app-username-hint',
  template: `
    @switch (status().kind) {
      @case ('checking') {
        <span class="text-ink-dim">Checking &#64;{{ name() }}…</span>
      }
      @case ('available') {
        <span class="font-semibold text-go"
          >&#64;{{ name() }} is free. It's yours if you save.</span
        >
      }
      @case ('current') {
        <span class="text-ink-dim">That's your current username.</span>
      }
      @case ('taken') {
        <span class="font-semibold text-danger">&#64;{{ name() }} is taken. Try another.</span>
      }
      @case ('invalid') {
        <span class="font-semibold text-danger">{{ message() }}</span>
      }
      @case ('error') {
        <span class="text-danger">Couldn't check that name. Check your connection.</span>
      }
      @default {
        <ng-content />
      }
    }
  `,
  host: { class: 'block min-h-6 text-sm', 'aria-live': 'polite' },
})
export class UsernameHint {
  readonly status = input.required<UsernameStatus>();
  readonly name = input.required<string>();

  protected message(): string {
    const status = this.status();
    return status.kind === 'invalid' ? status.message : '';
  }
}
