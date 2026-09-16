import { FirebaseOptions } from 'firebase/app';
import { firebaseConfig } from './firebase.config';

/** Swapped for firebase.env.emulator.ts by `npm run start:emulated`. */
export const firebaseEnv: { options: FirebaseOptions; useEmulators: boolean } = {
  options: firebaseConfig,
  useEmulators: false,
};
