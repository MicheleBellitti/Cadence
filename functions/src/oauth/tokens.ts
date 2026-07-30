import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { ACCESS_TTL_SECONDS, type ConnectorConfig } from "../config.js";
import { nowSeconds } from "./util.js";

const ALGORITHM = "HS256";

/** RFC 9068 media type, so an access token can never be mistaken for an ID token. */
const TOKEN_TYPE = "at+jwt";

export interface TokenDeps {
  config: ConnectorConfig;
  /** Raw HS256 secret. Never logged, never sent to a client. */
  signingKey: string;
}

export interface AccessTokenRequest {
  uid: string;
  clientId: string;
  scopes: string[];
  /** RFC 8707 resource identifier. Defaults to this connector's MCP endpoint. */
  resource?: string;
}

export interface SignedAccessToken {
  token: string;
  expiresIn: number;
}

function signingKeyBytes(deps: TokenDeps): Uint8Array {
  return new TextEncoder().encode(deps.signingKey);
}

/** Drop any fragment: RFC 8707 compares resource identifiers modulo the hash. */
export function normalizeResource(resource: URL | string): string {
  const url = new URL(typeof resource === "string" ? resource : resource.href);
  url.hash = "";
  return url.href;
}

/** The single audience value this connector accepts. */
export function resourceIdentifier(config: ConnectorConfig): string {
  return normalizeResource(config.resourceUrl);
}

/** 32 bytes of CSPRNG entropy, base64url — 43 characters, no padding. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateRefreshToken(): string {
  return generateOpaqueToken();
}

/** Identifier for a stored record. Not a credential — safe to log. */
export function generateId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * sha256 of a bearer credential, hex encoded. Only the digest is persisted, so
 * a database leak does not hand out usable refresh tokens or auth codes.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function signAccessToken(
  deps: TokenDeps,
  request: AccessTokenRequest
): Promise<SignedAccessToken> {
  const issuedAt = nowSeconds();
  const expiresAt = issuedAt + ACCESS_TTL_SECONDS;
  const token = await new SignJWT({
    client_id: request.clientId,
    scope: request.scopes.join(" "),
  })
    .setProtectedHeader({ alg: ALGORITHM, typ: TOKEN_TYPE })
    .setIssuer(deps.config.issuerUrl.href)
    .setSubject(request.uid)
    .setAudience(request.resource ?? resourceIdentifier(deps.config))
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setJti(generateOpaqueToken())
    .sign(signingKeyBytes(deps));
  return { token, expiresIn: ACCESS_TTL_SECONDS };
}

/**
 * Verify signature, issuer, audience and expiry.
 *
 * `requireBearerAuth` does not check the audience, so the `aud` claim is
 * enforced here: a token minted for another resource must not open this one.
 * Every failure collapses to one opaque message — jose's own errors describe
 * exactly which check failed and must not reach the client.
 */
export async function verifyAccessToken(deps: TokenDeps, token: string): Promise<AuthInfo> {
  const audience = resourceIdentifier(deps.config);

  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(token, signingKeyBytes(deps), {
      algorithms: [ALGORITHM],
      typ: TOKEN_TYPE,
      issuer: deps.config.issuerUrl.href,
      audience,
    });
    claims = payload;
  } catch {
    throw new InvalidTokenError("Access token is invalid or expired");
  }

  const uid = claims.sub;
  const clientId = claims.client_id;
  const expiresAt = claims.exp;
  const scope = claims.scope;

  if (typeof uid !== "string" || uid.length === 0) {
    throw new InvalidTokenError("Access token is invalid or expired");
  }
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new InvalidTokenError("Access token is invalid or expired");
  }
  // requireBearerAuth rejects a token without a numeric `expiresAt` in seconds.
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    throw new InvalidTokenError("Access token is invalid or expired");
  }

  const scopes = typeof scope === "string" ? scope.split(" ").filter((entry) => entry.length > 0) : [];

  return {
    token,
    clientId,
    scopes,
    expiresAt,
    resource: new URL(audience),
    extra: { uid },
  };
}
