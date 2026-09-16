import { FirebaseOptions } from 'firebase/app';

/** Local Auth + Firestore emulators (`npm run emulators`). The demo- project never touches real services. */
export const firebaseEnv: { options: FirebaseOptions; useEmulators: boolean } = {
  options: {
    apiKey: 'demo-key',
    authDomain: 'demo-checkmate.firebaseapp.com',
    projectId: 'demo-checkmate',
    appId: 'demo-app',
  },
  useEmulators: true,
};
