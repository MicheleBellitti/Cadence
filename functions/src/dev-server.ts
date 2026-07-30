/**
 * Local development entry point.
 *
 * The Functions emulator serves functions under /<project>/<region>/<name>,
 * but the MCP auth router mounts and advertises its endpoints at the origin
 * root — so OAuth discovery cannot work through the emulator's path prefix.
 * This script runs the same express app on a clean local port, talking to the
 * Firestore and Auth emulators, which is what MCP Inspector needs.
 *
 * Usage:
 *   firebase emulators:start --only firestore,auth      # terminal 1
 *   npm --prefix functions run dev                      # terminal 2
 */
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { auth, db } from "./firebase-admin.js";

const PORT = Number(process.env.PORT ?? 8787);

process.env.ISSUER_URL ??= `http://127.0.0.1:${PORT}`;
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.GOOGLE_CLOUD_PROJECT ??= "cadence-e2c93";
process.env.FIREBASE_PROJECT_ID ??= process.env.GOOGLE_CLOUD_PROJECT;
process.env.FIREBASE_API_KEY ??= "demo-api-key";
process.env.FIREBASE_AUTH_DOMAIN ??= `${process.env.GOOGLE_CLOUD_PROJECT}.firebaseapp.com`;

const app = createApp({
  config: loadConfig(),
  signingKey: process.env.MCP_TOKEN_KEY ?? "dev-only-insecure-signing-key-change-me",
  db: db(),
  auth: auth(),
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cadence connector (dev) listening on http://127.0.0.1:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`  MCP endpoint:  http://127.0.0.1:${PORT}/mcp`);
});
