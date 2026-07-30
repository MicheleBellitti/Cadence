import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

import { ACCESS_TTL_SECONDS, SCOPE_READ, type ConnectorConfig } from "../config.js";
import {
  generateOpaqueToken,
  generateRefreshToken,
  hashToken,
  normalizeResource,
  resourceIdentifier,
  signAccessToken,
  verifyAccessToken,
  type TokenDeps,
} from "./tokens.js";

const ISSUER = "https://connector.example.com/";

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    issuerUrl: new URL(ISSUER),
    resourceUrl: new URL("/mcp", ISSUER),
    firebaseWebConfig: { apiKey: "api-key", authDomain: "d.example.com", projectId: "p" },
    ...overrides,
  };
}

const deps: TokenDeps = { config: makeConfig(), signingKey: "signing-key-under-test" };

const AUDIENCE = resourceIdentifier(deps.config);

function sign(claims: Record<string, unknown>, options: { key?: string; typ?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: options.typ ?? "at+jwt" })
    .setIssuer(ISSUER)
    .setSubject("uid-1")
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(new TextEncoder().encode(options.key ?? deps.signingKey));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("resource identifiers", () => {
  it("strips the fragment when normalizing", () => {
    expect(normalizeResource("https://connector.example.com/mcp#frag")).toBe(
      "https://connector.example.com/mcp"
    );
  });

  it("derives the audience from the configured resource url", () => {
    expect(AUDIENCE).toBe("https://connector.example.com/mcp");
  });
});

describe("opaque credentials", () => {
  it("mints 32 bytes of base64url entropy", () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats a refresh token", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(200);
  });

  it("hashes to a stable sha256 hex digest that is not the token", () => {
    const token = generateRefreshToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).not.toBe(hashToken(generateRefreshToken()));
  });
});

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips uid, client and scopes", async () => {
    const { token, expiresIn } = await signAccessToken(deps, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
    });
    expect(expiresIn).toBe(ACCESS_TTL_SECONDS);

    const info = await verifyAccessToken(deps, token);
    expect(info.clientId).toBe("client-1");
    expect(info.scopes).toEqual([SCOPE_READ]);
    expect(info.extra).toEqual({ uid: "uid-1" });
    expect(info.resource?.href).toBe(AUDIENCE);
    expect(info.token).toBe(token);
  });

  it("reports expiresAt in seconds, not milliseconds", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { token } = await signAccessToken(deps, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
    });
    const info = await verifyAccessToken(deps, token);

    expect(info.expiresAt).toBeGreaterThanOrEqual(before + ACCESS_TTL_SECONDS);
    expect(info.expiresAt).toBeLessThanOrEqual(before + ACCESS_TTL_SECONDS + 5);
    // A milliseconds value would be ~1000x larger and would sail past
    // requireBearerAuth's expiry check forever.
    expect(info.expiresAt).toBeLessThan(1e11);
  });

  it("yields an empty scope list when the scope claim is empty", async () => {
    const { token } = await signAccessToken(deps, { uid: "uid-1", clientId: "client-1", scopes: [] });
    const info = await verifyAccessToken(deps, token);
    expect(info.scopes).toEqual([]);
  });

  it("rejects a tampered signature", async () => {
    const { token } = await signAccessToken(deps, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
    });
    const [header, payload, signature] = token.split(".");
    const flipped = signature.startsWith("A") ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    await expect(verifyAccessToken(deps, `${header}.${payload}.${flipped}`)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("rejects a tampered payload", async () => {
    const { token } = await signAccessToken(deps, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
    });
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    claims.sub = "attacker-uid";
    const forged = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    await expect(verifyAccessToken(deps, `${header}.${forged}.${signature}`)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("rejects a token signed with a different key", async () => {
    const token = await sign({ client_id: "client-1", scope: SCOPE_READ }, { key: "other-key" });
    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects an unsigned alg:none token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "at+jwt" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: ISSUER,
        sub: "uid-1",
        aud: AUDIENCE,
        client_id: "client-1",
        scope: SCOPE_READ,
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    ).toString("base64url");
    await expect(verifyAccessToken(deps, `${header}.${payload}.`)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("rejects a token minted for another resource", async () => {
    const { token } = await signAccessToken(deps, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
      resource: "https://someone-else.example.com/mcp",
    });
    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a token minted by another issuer", async () => {
    const foreign: TokenDeps = {
      config: makeConfig({ issuerUrl: new URL("https://evil.example.com/") }),
      signingKey: deps.signingKey,
    };
    const { token } = await signAccessToken(foreign, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
      resource: AUDIENCE,
    });
    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() - (ACCESS_TTL_SECONDS + 600) * 1000));
    const { token } = await signAccessToken(deps, {
      uid: "uid-1",
      clientId: "client-1",
      scopes: [SCOPE_READ],
    });
    vi.useRealTimers();

    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects an ID-token-shaped JWT that is not an access token", async () => {
    const token = await sign({ client_id: "client-1", scope: SCOPE_READ }, { typ: "JWT" });
    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a valid signature that is missing the subject", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ client_id: "client-1", scope: SCOPE_READ })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(new TextEncoder().encode(deps.signingKey));
    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a valid signature that is missing client_id", async () => {
    const token = await sign({ scope: SCOPE_READ });
    await expect(verifyAccessToken(deps, token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("does not leak the underlying failure reason", async () => {
    await expect(verifyAccessToken(deps, "not-a-jwt")).rejects.toThrow(
      "Access token is invalid or expired"
    );
  });
});
