import type { Response } from "express";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
  type OAuthTokenRevocationRequest,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import {
  AUTH_REQUEST_TTL_SECONDS,
  CODE_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  SCOPE_READ,
  type ConnectorConfig,
} from "../config.js";
import type { OAuthStore } from "./store.js";
import {
  generateId,
  generateOpaqueToken,
  generateRefreshToken,
  hashToken,
  normalizeResource,
  resourceIdentifier,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";
import { nowSeconds } from "./util.js";

export interface ProviderDeps {
  config: ConnectorConfig;
  signingKey: string;
  store: OAuthStore;
  auth: Auth;
}

/** Path the user is bounced to after `/authorize`, to sign in and consent. */
export const AUTHORIZE_UI_PATH = "/authorize/ui";

/** Schemes that would turn a redirect_uri into an XSS or exfiltration sink. */
const FORBIDDEN_REDIRECT_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:"]);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * OAuth 2.1 §2.3.1: a redirect_uri must be https, a loopback http address, or a
 * private-use scheme. Enforced at registration so a malicious DCR call cannot
 * plant a sink that later receives an authorization code.
 */
function assertRegisterableRedirectUri(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidClientMetadataError("redirect_uris must be absolute URIs");
  }
  const scheme = url.protocol.toLowerCase();
  if (FORBIDDEN_REDIRECT_SCHEMES.has(scheme)) {
    throw new InvalidClientMetadataError("redirect_uris must not use a script or data scheme");
  }
  if (scheme === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new InvalidClientMetadataError("http redirect_uris are only allowed for loopback addresses");
  }
  if (url.hash.length > 0) {
    throw new InvalidClientMetadataError("redirect_uris must not contain a fragment");
  }
}

/**
 * Outcome of resolving the Cadence account behind a grant. `missing` is a
 * definitive negative that justifies revocation; `unavailable` means Firebase
 * Auth could not answer and nothing may be concluded from it.
 */
type AccountLookup =
  | { status: "found"; user: UserRecord }
  | { status: "missing" }
  | { status: "unavailable" };

/** firebase-admin raises FirebaseAuthError with `code: "auth/user-not-found"`. */
function isUserNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code: unknown = error.code;
  return code === "auth/user-not-found";
}

function redirectWithError(
  res: Response,
  redirectUri: string,
  error: string,
  description: string,
  state?: string
): void {
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (state !== undefined) target.searchParams.set("state", state);
  res.redirect(302, target.href);
}

/**
 * This connector serves exactly one resource. A request naming anything else is
 * rejected rather than silently downgraded to the default audience.
 */
function resolveResource(config: ConnectorConfig, requested: URL | string | undefined): string {
  const expected = resourceIdentifier(config);
  if (requested === undefined) return expected;
  let normalized: string;
  try {
    normalized = normalizeResource(requested);
  } catch {
    throw new InvalidTargetError("Unknown resource identifier");
  }
  if (normalized !== expected) {
    throw new InvalidTargetError("Unknown resource identifier");
  }
  return expected;
}

export interface AuthorizationOutcome {
  redirectTo: string;
}

/**
 * Turn an approved `/authorize/ui` session into an authorization code bound to
 * the signed-in user. Returns undefined when the pending request is unknown or
 * expired — callers must not distinguish the two.
 */
export async function approveAuthorization(
  deps: Pick<ProviderDeps, "store">,
  requestId: string,
  uid: string
): Promise<AuthorizationOutcome | undefined> {
  const request = await deps.store.consumeAuthRequest(requestId);
  if (!request) return undefined;

  const code = generateOpaqueToken();
  const now = nowSeconds();
  await deps.store.createAuthCode({
    codeHash: hashToken(code),
    uid,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scopes: request.scopes,
    resource: request.resource,
    expiresAt: now + CODE_TTL_SECONDS,
    used: false,
  });

  const target = new URL(request.redirectUri);
  target.searchParams.set("code", code);
  if (request.state !== undefined) target.searchParams.set("state", request.state);
  return { redirectTo: target.href };
}

/** Discard a pending request and bounce the user back with `access_denied`. */
export async function denyAuthorization(
  deps: Pick<ProviderDeps, "store">,
  requestId: string
): Promise<AuthorizationOutcome | undefined> {
  const request = await deps.store.consumeAuthRequest(requestId);
  if (!request) return undefined;
  const target = new URL(request.redirectUri);
  target.searchParams.set("error", "access_denied");
  target.searchParams.set("error_description", "The user denied the authorization request.");
  if (request.state !== undefined) target.searchParams.set("state", request.state);
  return { redirectTo: target.href };
}

export function createOAuthProvider(deps: ProviderDeps): OAuthServerProvider {
  const clientsStore: OAuthRegisteredClientsStore = {
    async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
      return deps.store.getClient(clientId);
    },

    async registerClient(client): Promise<OAuthClientInformationFull> {
      // The SDK generates client_id and client_secret and authenticates clients
      // with a plaintext comparison, so the record is persisted verbatim — the
      // secret cannot be hashed at rest without breaking /token.
      // The SDK's own schema already rejects javascript: and friends; failing
      // here is a metadata problem (400), never a server fault (500).
      const parsed = OAuthClientInformationFullSchema.safeParse(client);
      if (!parsed.success) {
        throw new InvalidClientMetadataError("Client metadata is not valid");
      }
      for (const redirectUri of parsed.data.redirect_uris) {
        assertRegisterableRedirectUri(redirectUri);
      }
      await deps.store.saveClient(parsed.data);
      return parsed.data;
    },
  };

  async function loadUser(uid: string): Promise<AccountLookup> {
    try {
      return { status: "found", user: await deps.auth.getUser(uid) };
    } catch (error) {
      // Only "the user really is gone" is a definitive negative. Anything else
      // (network blip, quota, emulator restart) is indeterminate and must not
      // be allowed to destroy a grant.
      return isUserNotFound(error) ? { status: "missing" } : { status: "unavailable" };
    }
  }

  return {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(
      client: OAuthClientInformationFull,
      params: AuthorizationParams,
      res: Response
    ): Promise<void> {
      const requested = params.scopes ?? [];
      const scopes = requested.length === 0 ? [SCOPE_READ] : requested;
      if (scopes.some((scope) => scope !== SCOPE_READ)) {
        redirectWithError(
          res,
          params.redirectUri,
          "invalid_scope",
          `This connector only grants the ${SCOPE_READ} scope.`,
          params.state
        );
        return;
      }

      let resource: string;
      try {
        resource = resolveResource(deps.config, params.resource);
      } catch {
        redirectWithError(
          res,
          params.redirectUri,
          "invalid_target",
          "Unknown resource identifier.",
          params.state
        );
        return;
      }

      const requestId = generateOpaqueToken();
      await deps.store.createAuthRequest({
        requestId,
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        scopes,
        resource,
        expiresAt: nowSeconds() + AUTH_REQUEST_TTL_SECONDS,
      });

      res.redirect(302, `${AUTHORIZE_UI_PATH}?request=${encodeURIComponent(requestId)}`);
    },

    async challengeForAuthorizationCode(
      client: OAuthClientInformationFull,
      authorizationCode: string
    ): Promise<string> {
      // Called by the SDK before exchangeAuthorizationCode, so an unknown,
      // expired or already-redeemed code must be rejected here too.
      const record = await deps.store.getAuthCode(hashToken(authorizationCode));
      if (
        !record ||
        record.used ||
        record.clientId !== client.client_id ||
        record.expiresAt <= nowSeconds()
      ) {
        throw new InvalidGrantError("Invalid authorization code");
      }
      return record.codeChallenge;
    },

    async exchangeAuthorizationCode(
      client: OAuthClientInformationFull,
      authorizationCode: string,
      _codeVerifier?: string,
      redirectUri?: string,
      resource?: URL
    ): Promise<OAuthTokens> {
      const record = await deps.store.consumeAuthCode(hashToken(authorizationCode));
      if (!record || record.clientId !== client.client_id) {
        throw new InvalidGrantError("Invalid authorization code");
      }
      // The SDK does not re-check redirect_uri at /token; RFC 6749 §4.1.3 does.
      if (redirectUri !== record.redirectUri) {
        throw new InvalidGrantError("redirect_uri does not match the authorization request");
      }
      const audience = resolveResource(deps.config, resource);
      if (record.resource !== undefined && record.resource !== audience) {
        throw new InvalidGrantError("resource does not match the authorization request");
      }

      const { token: accessToken, expiresIn } = await signAccessToken(deps, {
        uid: record.uid,
        clientId: client.client_id,
        scopes: record.scopes,
        resource: audience,
      });

      const refreshToken = generateRefreshToken();
      const now = nowSeconds();
      await deps.store.createGrant({
        grantId: generateId(),
        familyId: generateId(),
        uid: record.uid,
        clientId: client.client_id,
        scopes: record.scopes,
        refreshTokenHash: hashToken(refreshToken),
        revoked: false,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now + REFRESH_TTL_SECONDS,
      });

      return {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: expiresIn,
        refresh_token: refreshToken,
        scope: record.scopes.join(" "),
      };
    },

    async exchangeRefreshToken(
      client: OAuthClientInformationFull,
      refreshToken: string,
      scopes?: string[],
      resource?: URL
    ): Promise<OAuthTokens> {
      const presentedHash = hashToken(refreshToken);
      const lookup = await deps.store.findGrantByRefreshToken(presentedHash);
      if (!lookup) {
        throw new InvalidGrantError("Invalid refresh token");
      }

      // Reuse detection: the presented token was rotated out of this family but
      // is still on record, so either the client or an attacker replayed it.
      // We cannot tell which, so the whole family dies.
      if (lookup.superseded) {
        await deps.store.revokeGrantFamily(lookup.familyId);
        throw new InvalidGrantError("Invalid refresh token");
      }

      const grant = lookup.grant;
      const now = nowSeconds();
      if (!grant || grant.revoked || grant.expiresAt <= now || grant.clientId !== client.client_id) {
        throw new InvalidGrantError("Invalid refresh token");
      }

      const requestedScopes = scopes !== undefined && scopes.length > 0 ? scopes : grant.scopes;
      if (requestedScopes.some((scope) => !grant.scopes.includes(scope))) {
        throw new InvalidScopeError("Requested scope exceeds the original grant");
      }

      const audience = resolveResource(deps.config, resource);

      // A disabled account or a Cadence password change must cut the connector
      // off without waiting for the 30-day refresh lifetime to run out.
      const account = await loadUser(grant.uid);
      if (account.status === "unavailable") {
        // Fail closed, but leave the grant intact: a momentary Firebase Auth
        // outage must not force the user through the whole flow again. 500
        // tells a well-behaved client to retry rather than discard its token.
        throw new ServerError("Could not verify the account for this grant");
      }
      if (account.status === "missing" || account.user.disabled) {
        await deps.store.revokeGrantFamily(grant.familyId);
        throw new InvalidGrantError("Invalid refresh token");
      }
      const validAfter = account.user.tokensValidAfterTime
        ? Math.floor(Date.parse(account.user.tokensValidAfterTime) / 1000)
        : undefined;
      if (validAfter !== undefined && Number.isFinite(validAfter) && validAfter > grant.createdAt) {
        await deps.store.revokeGrantFamily(grant.familyId);
        throw new InvalidGrantError("Invalid refresh token");
      }

      const nextRefreshToken = generateRefreshToken();
      const outcome = await deps.store.rotateRefreshToken({
        grantId: grant.grantId,
        oldHash: presentedHash,
        newHash: hashToken(nextRefreshToken),
        expiresAt: now + REFRESH_TTL_SECONDS,
        now,
      });
      if (outcome !== "rotated") {
        // Losing the rotation race means the hash we presented was superseded
        // between our read and our write. That is exactly what a replayed
        // stolen token looks like, so it gets the same answer: kill the family.
        if (outcome === "superseded") {
          await deps.store.revokeGrantFamily(grant.familyId);
        }
        throw new InvalidGrantError("Invalid refresh token");
      }

      const { token: accessToken, expiresIn } = await signAccessToken(deps, {
        uid: grant.uid,
        clientId: client.client_id,
        scopes: requestedScopes,
        resource: audience,
      });

      return {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: expiresIn,
        refresh_token: nextRefreshToken,
        scope: requestedScopes.join(" "),
      };
    },

    async verifyAccessToken(token: string): Promise<AuthInfo> {
      return verifyAccessToken(deps, token);
    },

    async revokeToken(
      client: OAuthClientInformationFull,
      request: OAuthTokenRevocationRequest
    ): Promise<void> {
      // RFC 7009 §2.2: an unknown or already-revoked token is a success.
      // Access tokens are stateless JWTs with a one-hour life and nothing to
      // revoke; only refresh-token families have server-side state.
      try {
        const lookup = await deps.store.findGrantByRefreshToken(hashToken(request.token));
        const grant = lookup?.grant;
        if (grant && grant.clientId === client.client_id) {
          await deps.store.revokeGrantFamily(grant.familyId);
        }
      } catch {
        // Swallow: revocation must never surface an error to the client.
      }
    },
  };
}
