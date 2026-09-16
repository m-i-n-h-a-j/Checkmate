import { InjectionToken, inject } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import { firebaseEnv } from './firebase.env';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP', {
  providedIn: 'root',
  factory: () => initializeApp(firebaseEnv.options),
});

export const AUTH = new InjectionToken<Auth>('AUTH', {
  providedIn: 'root',
  factory: () => {
    const auth = getAuth(inject(FIREBASE_APP));
    if (firebaseEnv.useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    return auth;
  },
});

export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  providedIn: 'root',
  factory: () => {
    const app = inject(FIREBASE_APP);
    if (!firebaseEnv.useEmulators) {
      return getFirestore(app);
    }
    // The emulator speaks HTTP/1.1, where streaming channels can exhaust the browser's per-host connection pool.
    const db = initializeFirestore(app, { experimentalForceLongPolling: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return db;
  },
});
