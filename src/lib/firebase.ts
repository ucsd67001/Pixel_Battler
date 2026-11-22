// Firebase のログイン（Google）。設定が無いとき（手元で .env に書いていないとき）は、何もしない。

import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';

const env = import.meta.env;
let auth: Auth | null = null;
let db: Firestore | null = null;
if (env.VITE_FIREBASE_API_KEY) {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
  // ロボの中の「無い項目」（undefined）があっても、そのまま保存できるようにする
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
}

export function firestore() {
  return db;
}

export function currentUser() {
  return auth?.currentUser ?? null;
}

export async function login() {
  if (!auth) return;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function logout() {
  if (auth) await signOut(auth);
}

export async function idToken(): Promise<string | null> {
  return auth?.currentUser ? auth.currentUser.getIdToken() : null;
}


// ログインの状態。undefined＝まだ分からない、null＝ログインしていない
export function useUser() {
  const [user, setUser] = useState<User | null | undefined>(auth ? undefined : null);
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);
  return user;
}
