import { Routes } from '@angular/router';
import { requireAuth } from './core/auth/guards';

export const routes: Routes = [
  {
    path: '',
    title: 'Checkmate | Live chess arcade',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'watch/:code',
    title: 'Watching a match | Checkmate',
    loadComponent: () => import('./features/watch/watch').then((m) => m.Watch),
  },
  {
    path: 'setup',
    title: 'Create your player | Checkmate',
    canActivate: [requireAuth],
    loadComponent: () => import('./features/setup/setup').then((m) => m.Setup),
  },
  {
    path: 'play',
    title: 'Play | Checkmate',
    canActivate: [requireAuth],
    loadComponent: () => import('./features/play/play').then((m) => m.Play),
  },
  {
    path: 'room/:code',
    title: 'Game room | Checkmate',
    canActivate: [requireAuth],
    loadComponent: () => import('./features/room/room').then((m) => m.RoomPage),
  },
  {
    path: 'friends',
    title: 'Friends | Checkmate',
    canActivate: [requireAuth],
    loadComponent: () => import('./features/friends/friends').then((m) => m.Friends),
  },
  {
    path: 'profile',
    title: 'Your player | Checkmate',
    canActivate: [requireAuth],
    loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
  },
  {
    path: '**',
    title: 'Game over | Checkmate',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
