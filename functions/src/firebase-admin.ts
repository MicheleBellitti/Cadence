import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;

function adminApp(): App {
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp();
  }
  return app;
}

export function db(): Firestore {
  return getFirestore(adminApp());
}

export function auth(): Auth {
  return getAuth(adminApp());
}
