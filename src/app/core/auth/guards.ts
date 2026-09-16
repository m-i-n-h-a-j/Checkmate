import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Guests can browse and watch; anything that involves playing sends them to the sign-in prompt. */
export const requireAuth: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.user()) {
    return true;
  }
  return router.createUrlTree(['/'], { queryParams: { signin: 1, next: state.url } });
};
