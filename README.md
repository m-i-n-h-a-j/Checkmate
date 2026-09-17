# Checkmate

A live chess arcade. Players sign in with Google, add friends, and play real-time chess in rooms that anyone can watch, or practice against a ladder of Stockfish bots.

**Stack:** Angular 22 (standalone, zoneless, signals) · Tailwind CSS v4 · Firebase JS SDK v12 (Auth + Firestore) · [chessground](https://github.com/lichess-org/chessground) board · [chess.js](https://github.com/jhlywa/chess.js) rules engine · [Stockfish.js](https://github.com/nmrugg/stockfish.js) bots

## What's built

| Area         | Details                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in      | One button. Google account chooser (`prompt: select_account`), popup with redirect fallback.                                                                                                                                                                                                                                                                                                                                                          |
| Watching     | Signed-out visitors see the Live Arena on `/` and can open any live match at `/watch/:code`.                                                                                                                                                                                                                                                                                                                                                          |
| Player setup | After the first sign-in, players pick a display name and an optional unique `@username` (live availability check, suggestions). They can skip. Without a username, friends add them by email or player ID.                                                                                                                                                                                                                                            |
| Friends      | Send requests by email, `@username` or player ID. Accept, decline, cancel, remove. Online presence. Mutual requests auto-accept.                                                                                                                                                                                                                                                                                                                      |
| Rooms        | Create a room and share a 6-character code, or challenge a friend directly. The host picks the clock (1+0 up to 30+0) and their color. Both players ready up, 3-2-1 countdown, match goes live for everyone.                                                                                                                                                                                                                                          |
| Chess        | Drag, tap or type moves (`e4`, `Nf3`, `O-O`). Legal-move hints, premoves, promotion picker, check, checkmate, stalemate, threefold, fifty-move and insufficient-material draws.                                                                                                                                                                                                                                                                       |
| Clocks       | Fischer clocks judged by server timestamps. Each side's first move is free. Either player's app calls the flag when time runs out; a lone king can't win on time.                                                                                                                                                                                                                                                                                     |
| Game actions | Abort (before both have moved), offer/accept/decline draws, resign, flip board, sounds on/off, rematch with colors swapped.                                                                                                                                                                                                                                                                                                                           |
| Ratings      | Elo (K = 32). The write that ends a game updates both players' stats in the same transaction.                                                                                                                                                                                                                                                                                                                                                         |
| Spectating   | Live arena cards show each game's position. The watch page follows moves and clocks live.                                                                                                                                                                                                                                                                                                                                                             |
| Bots         | Eight arcade bots from ≈250 (Pawnbot) to ≈3000 (The Final Boss) at `/bots`, no sign-in needed. Pick a color and an optional clock. Hints (gold arrow), undo, resign, and "Play the next bot" after a win. Games run on the device only: never stored in Firestore, never in the Live arena, never rated. Wins, losses and draws per bot are kept in the browser, and an unfinished game resumes after a reload. Clocks pause while the tab is hidden. |
| Effects      | 3D moments over the board: shattering captures ("QUEEN DOWN!"), promotions ("QUEENED!"), check stamps, a toppling king on checkmate, frozen stalemates, K.O. on resign. "Heavy effects" in the game panel or player menu switches to a light mode (also stops the rolling floor, sign lights and background blurs). Reduced-motion users never see them.                                                                                              |
| Rules        | `firestore.rules` enforces unique usernames, friends-only challenges, seat ownership, legal room state changes, turn order, append-only moves, server-time clocks, honest results and Elo-checked stats.                                                                                                                                                                                                                                              |

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

Production builds register the Angular service worker (`ngsw-config.json`) and ship `public/manifest.webmanifest` with icons in `public/icons`. The app shell, Google Fonts and, after the first bot game, the chess engine are cached, so launches are instant and bot games work offline; Firestore traffic always goes to the network. When a new deploy is detected, players get a "Refresh" toast instead of a forced reload, so a live match is never interrupted. The service worker is off in `npm start` and `npm run start:emulated`; test it with `npm run build` and any static server on `localhost`.

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

| Collection                   | Purpose                                                                                                                                                                                        | Access                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `users/{uid}`                | Public profile: name, username, photo, stats, `lastActive`, `lastGame`                                                                                                                         | Anyone reads; owner writes profile fields; stats change only with a game result |
| `usernames/{name}`           | Username registry, `{ uid }`                                                                                                                                                                   | Doc id = username, so it's unique                                               |
| `emails/{email}`             | Email lookup, `{ uid }`                                                                                                                                                                        | Signed-in `get` only, never listed                                              |
| `friendRequests/{from}_{to}` | Pending request with player snapshots                                                                                                                                                          | Only the two players                                                            |
| `friendships/{uidA}_{uidB}`  | `members: [a, b]`, sorted pair id                                                                                                                                                              | Only members                                                                    |
| `rooms/{code}`               | Seats, ready flags, status `waiting → live → finished` (or `cancelled`/`declined`), plus the game: clock, colors, UCI move list, FEN, clocks, draw offer, result, rating changes, rematch link | Anyone can get; listing limited to live rooms and your own                      |

### How a game is stored

The whole game lives in its room document, so a move, both clocks and the result always change together and spectators need one listener.

- `moves` is an append-only list of UCI moves (`e2e4`, `e7e8q`). `fen` is the position after the last one, for arena cards.
- `whiteMs`/`blackMs` hold each side's time left as of their previous move. `lastMoveAt`/`prevMoveAt` are server timestamps. The mover settles the opponent's last think time (increment minus the gap between the two timestamps), and the rules recompute it exactly.
- The rules check turn order, move format, clocks, and that results and stats are consistent. They can't run a chess move generator, so legality is checked by both players' apps with chess.js; a game with an illegal move stops and can be resigned.

Every room carries `expiresAt`. The app hides waiting rooms older than 24 hours and live rooms older than 6 hours. Automatic deletion needs a Firestore TTL policy on `rooms.expiresAt`, which requires the Blaze (pay-as-you-go) plan; add it under Firestore → TTL once billing is on.

## Project layout

```
src/app/
  core/        firebase setup, models, services (auth, profile, presence, friends, rooms), utils
    game/      chess replay (chess.js), clocks, Elo, server clock sync, game actions, sounds
    bots/      bot roster and avatars, Stockfish worker service, local bot games and records
    settings/  heavy effects on/off
  shared/      UI pieces (avatar, code input, player card, toasts), chessground board, confetti
  layout/      arcade background
  features/    home, watch, setup, play, room, friends, profile, not-found
    game/      game view: player strips, move list, typed moves, controls, result, 3D board effects
    bots/      bot ladder and bot game pages
  styles/      chessground theme, piece art, board effects
public/engine/ Stockfish 19 lite single-threaded build (JS worker + 1.8 MB WebAssembly)
tests/         Firestore security rules tests
```

## Bot engine

Bots run [Stockfish.js](https://github.com/nmrugg/stockfish.js) 19, the lite single-threaded WebAssembly build, in a Web Worker (`src/app/core/bots/stockfish.service.ts`). It needs no cross-origin isolation headers, which matters because those headers break Google's sign-in popup. The files in `public/engine/` are copied from the `stockfish` npm package's `bin/` folder; to upgrade, copy the new `stockfish-*-lite-single.js` and `.wasm` there and update `ENGINE_PATH`.

Stockfish's own strength limit (`UCI_Elo`) only goes down to 1320, so the four weakest bots use a low `Skill Level`, shallow depth and a chance of playing a random legal move instead. Each bot's settings are in `src/app/core/bots/bots.ts`.

## Third-party licenses

This is a private project with no license of its own. It bundles [chessground](https://github.com/lichess-org/chessground) (GPL-3.0-or-later), the cburnett piece set that ships with it (GPL-2.0-or-later), and [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0, license text in `public/engine/COPYING.txt`). The GPL applies when the app is distributed, which includes serving it from a public site: anyone who receives the app can ask for its source under the same license.
