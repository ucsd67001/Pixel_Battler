// Firebase のログイン（Google）。設定が無いとき（手元で .env に書いていないとき）は、何もしない。

import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth';
import { useEffect, useState } from 'react';

const env = import.meta.env;
let auth: Auth | null = null;
if (env.VITE_FIREBASE_API_KEY) {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
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
