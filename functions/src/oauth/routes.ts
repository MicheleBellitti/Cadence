import express from "express";
import type { Auth } from "firebase-admin/auth";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { z } from "zod";

import { SCOPE_READ, type ConnectorConfig } from "../config.js";
import { buildContentSecurityPolicy, renderAuthorizePage, renderErrorPage } from "./authorize-page.js";
import { approveAuthorization, denyAuthorization } from "./provider.js";
import type { OAuthStore } from "./store.js";
import { nowSeconds } from "./util.js";

/** Request ids are 32 random bytes, base64url: exactly 43 unpadded characters. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** An ID token is a compact JWS; anything larger than this is not one. */
const MAX_ID_TOKEN_LENGTH = 8192;

const CompleteRequestSchema = z.object({
  requestId: z.string(),
  idToken: z.string().max(MAX_ID_TOKEN_LENGTH).optional(),
  denied: z.boolean().optional(),
});

export interface RouterDeps {
  config: ConnectorConfig;
  store: OAuthStore;
  auth: Auth;
  provider: OAuthServerProvider;
}

function readRequestId(value: unknown): string | undefined {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

/**
 * One response shape for every rejection on /authorize/complete. Distinguishing
 * "unknown request" from "expired" from "bad ID token" would turn the endpoint
 * into an oracle for probing request ids.
 */
function rejectRequest(res: express.Response): void {
  res.status(400).json({ error: "invalid_request" });
}

export function createOAuthRouter(deps: RouterDeps): express.Router {
  const router = express.Router();
  const contentSecurityPolicy = buildContentSecurityPolicy(deps.config);

  function applyPageHeaders(res: express.Response): void {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
  }

  function sendErrorPage(res: express.Response, status: number, message: string): void {
    applyPageHeaders(res);
    res.status(status).type("html").send(renderErrorPage(message));
  }

  // Registered before mcpAuthRouter: the SDK mounts its authorization handler on
  // `/authorize`, and both of these paths live underneath it. Declaring them
  // first keeps them off the SDK's /authorize rate limiter.
  router.get("/authorize/ui", (req, res) => {
    void (async () => {
      try {
        const requestId = readRequestId(req.query.request);
        if (!requestId) {
          sendErrorPage(res, 400, "This authorization link is not valid.");
          return;
        }

        const request = await deps.store.getAuthRequest(requestId);
        if (!request || request.expiresAt <= nowSeconds()) {
          sendErrorPage(
            res,
            400,
            "This authorization request has expired. Start again from your MCP client."
          );
          return;
        }

        const client = await deps.store.getClient(request.clientId);
        const clientName = client?.client_name?.trim() || request.clientId;

        applyPageHeaders(res);
        res
          .status(200)
          .type("html")
          .send(
            renderAuthorizePage(
              { config: deps.config },
              {
                requestId,
                clientName,
                // The URI bound to this request, not client.redirect_uris[0]:
                // what the page shows must be where the code actually goes.
                redirectUri: request.redirectUri,
              }
            )
          );
      } catch {
        sendErrorPage(res, 500, "Something went wrong. Start again from your MCP client.");
      }
    })();
  });

  // Same-origin only: no CORS headers are ever set here, and a cross-site form
  // post cannot produce an application/json body without a preflight.
  router.post("/authorize/complete", express.json({ limit: "16kb" }), (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");

      const origin = req.headers.origin;
      if (typeof origin === "string" && origin !== deps.config.issuerUrl.origin) {
        rejectRequest(res);
        return;
      }

      try {
        const parsed = CompleteRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          rejectRequest(res);
          return;
        }
        const requestId = readRequestId(parsed.data.requestId);
        if (!requestId) {
          rejectRequest(res);
          return;
        }

        if (parsed.data.denied === true) {
          const outcome = await denyAuthorization(deps, requestId);
          if (!outcome) {
            rejectRequest(res);
            return;
          }
          res.status(200).json(outcome);
          return;
        }

        const idToken = parsed.data.idToken;
        if (typeof idToken !== "string" || idToken.length === 0) {
          rejectRequest(res);
          return;
        }

        // checkRevoked: a token minted before a password change must not be
        // able to bootstrap a fresh connector grant.
        let uid: string;
        try {
          const decoded = await deps.auth.verifyIdToken(idToken, true);
          uid = decoded.uid;
        } catch {
          rejectRequest(res);
          return;
        }
        if (typeof uid !== "string" || uid.length === 0) {
          rejectRequest(res);
          return;
        }

        const outcome = await approveAuthorization(deps, requestId, uid);
        if (!outcome) {
          rejectRequest(res);
          return;
        }
        res.status(200).json(outcome);
      } catch {
        rejectRequest(res);
      }
    })();
  });

  router.use(
    mcpAuthRouter({
      provider: deps.provider,
      issuerUrl: deps.config.issuerUrl,
      resourceServerUrl: deps.config.resourceUrl,
      scopesSupported: [SCOPE_READ],
      resourceName: "Cadence",
      // A personal connector must not stop working after 30 days, and the SDK
      // compares client secrets in plaintext, so rotation is not on offer here.
      clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
    })
  );

  return router;
}
