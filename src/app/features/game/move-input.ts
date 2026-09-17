import { Component, input, output, signal } from '@angular/core';

/** Type a move instead of dragging, for keyboard and screen reader players. */
@Component({
  selector: 'app-move-input',
  template: `
    <form class="flex items-end gap-2" (submit)="submit($event)">
      <div class="min-w-0 flex-1">
        <label class="mb-1 block text-sm font-semibold" for="move-entry">Type a move</label>
        <input
          id="move-entry"
          class="field min-h-11 py-2 text-base"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          list="legal-moves"
          placeholder="e4, Nf3, O-O"
          [disabled]="disabled()"
          [value]="text()"
          [attr.aria-invalid]="error() ? true : null"
          aria-describedby="move-entry-hint"
          (input)="onInput($event)"
        />
        <datalist id="legal-moves">
          @for (move of legal(); track move) {
            <option [value]="move"></option>
          }
        </datalist>
      </div>
      <button type="submit" class="btn btn-cyan btn-sm min-h-11" [disabled]="disabled() || !text()">
        Play
      </button>
    </form>
    <p
      id="move-entry-hint"
      class="mt-1.5 min-h-5 text-sm"
      [class.text-danger]="error()"
      [class.text-ink-dim]="!error()"
      aria-live="polite"
    >
      {{ error() || hint() }}
    </p>
  `,
})
export class MoveInput {
  /** Legal moves in SAN, offered as suggestions. */
  readonly legal = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly hint = input('');
  /** Emits the typed move. The parent calls `reject()` if it isn't legal. */
  readonly played = output<string>();

  protected readonly text = signal('');
  protected readonly error = signal('');

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.error.set('');
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const move = this.text().trim();
    if (!move || this.disabled()) return;
    this.played.emit(move);
  }

  accept(): void {
    this.text.set('');
    this.error.set('');
  }

  reject(move: string): void {
    this.error.set(`${move} isn't a legal move here.`);
  }
}
