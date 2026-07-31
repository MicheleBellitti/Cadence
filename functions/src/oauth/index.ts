import type express from "express";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";

import type { ConnectorConfig } from "../config.js";
import { createOAuthProvider } from "./provider.js";
import { createOAuthRouter } from "./routes.js";
import { createFirestoreStore, type OAuthStore } from "./store.js";

export interface OAuthDeps {
  config: ConnectorConfig;
  /** Raw HS256 secret from `MCP_TOKEN_KEY.value()`. */
  signingKey: string;
  db: Firestore;
  auth: Auth;
  /** Override the Firestore-backed state store. Tests inject the memory store. */
  store?: OAuthStore;
}

export interface OAuthSubsystem {
  /** Mount at the application root: `app.use(router)`. */
  router: express.RequestHandler;
  /** Pass to `requireBearerAuth` on the resource server. */
  verifier: OAuthTokenVerifier;
}

/**
 * Wire the OAuth 2.1 authorization server: Firestore-backed state, the MCP SDK
 * router for the standard endpoints, and the Cadence sign-in and consent pages.
 */
export function createOAuthSubsystem(deps: OAuthDeps): OAuthSubsystem {
  const store = deps.store ?? createFirestoreStore(deps.db);
  const provider = createOAuthProvider({
    config: deps.config,
    signingKey: deps.signingKey,
    store,
    auth: deps.auth,
  });
  const router = createOAuthRouter({
    config: deps.config,
    store,
    auth: deps.auth,
    provider,
  });
  return { router, verifier: provider };
}

export {
  buildContentSecurityPolicy,
  describeRedirectTarget,
  escapeHtml,
  jsonForScript,
  renderAuthorizePage,
  renderErrorPage,
  type AuthorizePageParams,
} from "./authorize-page.js";
export {
  approveAuthorization,
  createOAuthProvider,
  denyAuthorization,
  AUTHORIZE_UI_PATH,
  type AuthorizationOutcome,
  type ProviderDeps,
} from "./provider.js";
export { createOAuthRouter, type RouterDeps } from "./routes.js";
export {
  createFirestoreStore,
  createMemoryStore,
  AUTH_CODES_COLLECTION,
  AUTH_REQUESTS_COLLECTION,
  CLIENTS_COLLECTION,
  GRANTS_COLLECTION,
  GRANT_TOKENS_COLLECTION,
  TTL_FIELD,
  isSafeDocumentId,
  type OAuthStore,
  type RefreshTokenLookup,
  type RotateRefreshTokenOutcome,
  type StoredAuthCode,
  type StoredAuthRequest,
  type StoredGrant,
} from "./store.js";
export {
  generateId,
  generateOpaqueToken,
  generateRefreshToken,
  hashToken,
  normalizeResource,
  resourceIdentifier,
  signAccessToken,
  verifyAccessToken,
  type AccessTokenRequest,
  type TokenDeps,
} from "./tokens.js";
export { nowSeconds } from "./util.js";
