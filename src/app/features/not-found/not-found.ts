import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section
      class="mx-auto flex min-h-[calc(100dvh-4rem-env(safe-area-inset-top))] max-w-xl flex-col items-center justify-center px-4 text-center"
    >
      <h1 class="pixel animate-pop-in text-3xl text-neon-pink glow-pink sm:text-5xl">GAME OVER</h1>
      <p class="mt-6 text-lg text-ink-dim">This page doesn't exist.</p>
      <p class="pixel mt-10 text-sm text-gold glow-gold" aria-live="off">
        Continue? {{ seconds() }}
      </p>
      <a routerLink="/" class="btn btn-gold btn-lg mt-8">Continue</a>
    </section>
  `,
})
export class NotFound {
  protected readonly seconds = signal(9);

  constructor() {
    const router = inject(Router);
    const timer = setInterval(() => {
      this.seconds.update((s) => s - 1);
      if (this.seconds() === 0) {
        clearInterval(timer);
        void router.navigateByUrl('/');
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
