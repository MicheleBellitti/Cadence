import express from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import { SCOPE_READ, type ConnectorConfig } from "./config.js";
import { createOAuthSubsystem, type OAuthStore } from "./oauth/index.js";
import { createMcpHandler } from "./mcp/index.js";
import { allowRequest } from "./rate-limit.js";

export interface AppDeps {
  config: ConnectorConfig;
  signingKey: string;
  db: Firestore;
  auth: Auth;
  /** Override the Firestore-backed OAuth state store. Tests inject the memory store. */
  oauthStore?: OAuthStore;
}

/**
 * Build the connector's express app: the OAuth authorization server at the
 * root, and the MCP resource server behind bearer auth at /mcp.
 */
export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Exactly one hop: Cloud Run appends the real client address to
  // X-Forwarded-For. Trusting the whole chain instead would make `req.ip` the
  // leftmost, fully client-supplied entry, letting anyone rotate a header to
  // sidestep the SDK's per-IP rate limits on /register, /token and /authorize.
  app.set("trust proxy", 1);

  const { router: oauthRouter, verifier } = createOAuthSubsystem({
    ...deps,
    store: deps.oauthStore,
  });

  // mcpAuthRouter must be mounted at the application root: it owns /authorize,
  // /token, /register, /revoke and both .well-known metadata documents.
  app.use(oauthRouter);

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(deps.config.resourceUrl);
  const bearerAuth = requireBearerAuth({
    verifier,
    requiredScopes: [SCOPE_READ],
    resourceMetadataUrl,
  });

  const mcpHandler = createMcpHandler({ db: deps.db });

  app.post("/mcp", express.json({ limit: "1mb" }), bearerAuth, (req, res, next) => {
    const uid = typeof req.auth?.extra?.uid === "string" ? req.auth.extra.uid : "";
    if (!allowRequest(uid)) {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Rate limit exceeded, try again shortly" },
        id: null,
      });
      return;
    }
    mcpHandler(req, res, next);
  });

  // Stateless server: no SSE stream to resume, no session to delete.
  app.all("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." },
      id: null,
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Without this, a malformed body on /mcp falls through to express's default
  // handler, which answers with an HTML error page — and, outside production,
  // a stack trace. An MCP client expects JSON-RPC either way.
  app.use(
    (
      error: Error & { status?: number; statusCode?: number },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const status = error.status ?? error.statusCode ?? 500;
      if (req.path === "/mcp") {
        res.status(status).json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Invalid request body" },
          id: null,
        });
        return;
      }
      res.status(status).json({ error: "invalid_request" });
    }
  );

  return app;
}
