# Checkmate

A live chess arcade. Players sign in with Google, add friends, and battle in rooms that anyone can watch. This is the foundation: auth, profiles, friends, rooms, and the live arena. Chess gameplay comes next.

**Stack:** Angular 22 (standalone, zoneless, signals) · Tailwind CSS v4 · Firebase JS SDK v12 (Auth + Firestore)

## What's built

| Area         | Details                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in      | One button. Google account chooser (`prompt: select_account`), popup with redirect fallback.                                                                                                               |
| Watching     | Signed-out visitors see the Live Arena on `/` and can open any live match at `/watch/:code`.                                                                                                               |
| Player setup | After the first sign-in, players pick a display name and an optional unique `@username` (live availability check, suggestions). They can skip. Without a username, friends add them by email or player ID. |
| Friends      | Send requests by email, `@username` or player ID. Accept, decline, cancel, remove. Online presence. Mutual requests auto-accept.                                                                           |
| Rooms        | Create a room and share a 6-character code, or challenge a friend directly. VS screen, both players ready up, 3-2-1 countdown, match goes live for everyone.                                               |
| Rules        | `firestore.rules` enforces unique usernames, friends-only challenges, seat ownership, legal room state changes, and read-only stats.                                                                       |

## Run it locally (no Firebase project needed)

Uses the Firebase emulators with a fake Google sign-in screen, so you can test with several players on one machine.

```bash
npm install
npm run emulators        # terminal 1: Auth on :9099, Firestore on :8080 (needs Java 21+)
npm run start:emulated   # terminal 2: http://localhost:4200
```

Open a second browser profile or an incognito window to sign in as another player.

## Firebase project

|            |                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Project    | `checkmate-arcade-2xjdv` ([console](https://console.firebase.google.com/project/checkmate-arcade-2xjdv/overview)) |
| Firestore  | `(default)` in `asia-south1` (Mumbai), pinned in `firebase.json`                                                  |
| Web config | `src/app/core/firebase/firebase.config.ts`                                                                        |
| Hosting    | Netlify: https://checkmate-chess.netlify.app                                                                      |

One-time console setup (not scriptable from the Firebase CLI):

1. **Authentication → Get started → Sign-in method → Google → Enable**, pick a support email, save.
2. **Authentication → Settings → Authorized domains → Add domain:** `checkmate-chess.netlify.app`. `localhost` is already allowed.

Deploy rule or index changes with `npm run deploy:rules`.

## Deploy to Netlify

`netlify.toml` holds the build settings (`npm run build`, publish `dist/checkmate/browser`, Node 24), the single-page-app fallback to `index.html`, long-lived caching for hashed assets (matched by `main-`/`chunk-`/`styles-` prefix so `ngsw-worker.js` and `ngsw.json` stay revalidated), and a `Cross-Origin-Opener-Policy: same-origin-allow-popups` header so the Google sign-in popup can report back. Connect the repo in Netlify or run `netlify deploy --prod`.

Sign-in uses a popup on `checkmate-arcade-2xjdv.firebaseapp.com`, which works in browsers that block third-party storage. If you later switch to redirect sign-in, proxy `/__/auth/*` to the firebaseapp.com domain and set `authDomain` to the Netlify domain first.

## Installable app (PWA)

Production builds register the Angular service worker (`ngsw-config.json`) and ship `public/manifest.webmanifest` with icons in `public/icons`. The app shell and Google Fonts are cached so launches are instant; Firestore traffic always goes to the network. When a new deploy is detected, players get a "Refresh" toast instead of a forced reload, so a live match is never interrupted. The service worker is off in `npm start` and `npm run start:emulated`; test it with `npm run build` and any static server on `localhost`.

## Scripts

| Script                   | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| `npm start`              | Dev server against the real Firebase project (http://localhost:4200)  |
| `npm run start:emulated` | Dev server against local emulators                                    |
| `npm run emulators`      | Start Auth + Firestore emulators                                      |
| `npm test`               | Unit tests (Vitest)                                                   |
| `npm run test:rules`     | Security rules tests in the Firestore emulator                        |
| `npm run build`          | Production build to `dist/checkmate/browser` (what Netlify publishes) |
| `npm run deploy:rules`   | Deploy `firestore.rules` and `firestore.indexes.json`                 |

## Data model

| Collection                   | Purpose                                                                            | Access                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `users/{uid}`                | Public profile: name, username, photo, stats, `lastActive`                         | Anyone reads; owner writes (never `stats`)                 |
| `usernames/{name}`           | Username registry, `{ uid }`                                                       | Doc id = username, so it's unique                          |
| `emails/{email}`             | Email lookup, `{ uid }`                                                            | Signed-in `get` only, never listed                         |
| `friendRequests/{from}_{to}` | Pending request with player snapshots                                              | Only the two players                                       |
| `friendships/{uidA}_{uidB}`  | `members: [a, b]`, sorted pair id                                                  | Only members                                               |
| `rooms/{code}`               | Seats, ready flags, status `waiting → live → finished` (or `cancelled`/`declined`) | Anyone can get; listing limited to live rooms and your own |

Every room carries `expiresAt`. The app hides waiting rooms older than 24 hours and live rooms older than 6 hours. Automatic deletion needs a Firestore TTL policy on `rooms.expiresAt`, which requires the Blaze (pay-as-you-go) plan; add it under Firestore → TTL once billing is on.

## Project layout

```
src/app/
  core/        firebase setup, models, services (auth, profile, presence, friends, rooms), utils
  shared/      UI pieces (avatar, code input, player card, toasts, board placeholder) and effects
  layout/      arcade background
  features/    home, watch, setup, play, room, friends, profile, not-found
tests/         Firestore security rules tests
```
