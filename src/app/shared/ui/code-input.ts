import { Component, computed, input, model, output, signal } from '@angular/core';
import { ROOM_CODE_LENGTH, sanitizeRoomCode } from '../../core/util/ids';

/** One real text input laid over six arcade character boxes, so paste and screen readers just work. */
@Component({
  selector: 'app-code-input',
  template: `
    <label class="relative block w-full max-w-[22rem]">
      <span class="sr-only">{{ label() }}</span>
      <input
        class="absolute inset-0 z-10 size-full cursor-text opacity-0"
        type="text"
        inputmode="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        [attr.maxlength]="length"
        [value]="value()"
        [attr.aria-invalid]="invalid() || null"
        (input)="onInput($event)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false)"
        (keydown.enter)="submitted.emit(value())"
      />
      <span class="code-row" [class.animate-shake]="invalid()" aria-hidden="true">
        @for (slot of slots; track slot) {
          <span
            class="code-box"
            [class.code-box-filled]="!!value()[slot]"
            [class.code-box-active]="focused() && slot === activeSlot()"
          >
            @if (value()[slot]) {
              {{ value()[slot] }}
            } @else if (focused() && slot === activeSlot()) {
              <span class="animate-blink text-neon-cyan">_</span>
            }
          </span>
        }
      </span>
    </label>
  `,
})
export class CodeInput {
  readonly value = model('');
  readonly label = input('Room code');
  readonly invalid = input(false);
  readonly submitted = output<string>();

  protected readonly length = ROOM_CODE_LENGTH;
  protected readonly slots = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => i);
  protected readonly focused = signal(false);
  protected readonly activeSlot = computed(() =>
    Math.min(this.value().length, ROOM_CODE_LENGTH - 1),
  );

  protected onInput(event: Event): void {
    const element = event.target as HTMLInputElement;
    const clean = sanitizeRoomCode(element.value);
    element.value = clean;
    this.value.set(clean);
  }
}
