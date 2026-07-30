import { onRequest } from "firebase-functions/v2/https";
import type express from "express";

import { createApp } from "./app.js";
import { FUNCTION_REGION, MCP_TOKEN_KEY, loadConfig } from "./config.js";
import { auth, db } from "./firebase-admin.js";

let cachedApp: express.Express | undefined;

/**
 * Built on first request, not at module scope: Secret Manager values are not
 * materialized during deployment discovery, so constructing the app eagerly
 * would break `firebase deploy`.
 */
function getApp(): express.Express {
  if (!cachedApp) {
    cachedApp = createApp({
      config: loadConfig(),
      signingKey: MCP_TOKEN_KEY.value(),
      db: db(),
      auth: auth(),
    });
  }
  return cachedApp;
}

export const connector = onRequest(
  {
    region: FUNCTION_REGION,
    secrets: [MCP_TOKEN_KEY],
    maxInstances: 5,
    invoker: "public",
  },
  (req, res) => {
    getApp()(req, res);
  }
);
