import { beforeEach, describe, expect, it } from "vitest";
import type { Response } from "express";
import type { Auth } from "firebase-admin/auth";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { REFRESH_TTL_SECONDS, SCOPE_READ, type ConnectorConfig } from "../config.js";
import { approveAuthorization, createOAuthProvider, denyAuthorization } from "./provider.js";
import { createMemoryStore, type OAuthStore } from "./store.js";
import { generateRefreshToken, hashToken, verifyAccessToken } from "./tokens.js";
import { nowSeconds } from "./util.js";

const ISSUER = "https://connector.example.com/";
const REDIRECT_URI = "https://client.example.com/callback";
const SIGNING_KEY = "signing-key-under-test";

const config: ConnectorConfig = {
  issuerUrl: new URL(ISSUER),
  resourceUrl: new URL("/mcp", ISSUER),
  firebaseWebConfig: { apiKey: "api-key", authDomain: "d.example.com", projectId: "p" },
};

const clientA: OAuthClientInformationFull = {
  client_id: "client-a",
  client_secret: "secret-a",
  redirect_uris: [REDIRECT_URI],
  client_name: "Client A",
};

const clientB: OAuthClientInformationFull = {
  client_id: "client-b",
  client_secret: "secret-b",
  redirect_uris: ["https://other.example.com/callback"],
  client_name: "Client B",
};

interface FakeUser {
  uid: string;
  disabled?: boolean;
  tokensValidAfterTime?: string;
}

/** Shaped like a real FirebaseAuthError: the `code` property is what matters. */
function firebaseAuthError(code: string): Error {
  return Object.assign(new Error(`fake ${code}`), { code });
}

/** Set by a test to make the next getUser call fail transiently. */
let authFailure: Error | undefined;

/** firebase-admin's Auth is huge; the provider only ever calls getUser. */
function makeFakeAuth(users: Map<string, FakeUser>): Auth {
  return {
    async getUser(uid: string) {
      if (authFailure) throw authFailure;
      const user = users.get(uid);
      if (!user) throw firebaseAuthError("auth/user-not-found");
      return {
        uid: user.uid,
        disabled: user.disabled ?? false,
        tokensValidAfterTime: user.tokensValidAfterTime,
      };
    },
  } as unknown as Auth;
}

interface CapturedRedirect {
  status?: number;
  url?: string;
}

function captureRedirect(): { captured: CapturedRedirect; res: Response } {
  const captured: CapturedRedirect = {};
  const res = {
    redirect(status: number, url: string) {
      captured.status = status;
      captured.url = url;
    },
  };
  return { captured, res: res as unknown as Response };
}

let store: OAuthStore;
let users: Map<string, FakeUser>;
let provider: OAuthServerProvider;

beforeEach(async () => {
  authFailure = undefined;
  store = createMemoryStore();
  users = new Map<string, FakeUser>([["uid-1", { uid: "uid-1" }]]);
  provider = createOAuthProvider({
    config,
    signingKey: SIGNING_KEY,
    store,
    auth: makeFakeAuth(users),
  });
  await store.saveClient(clientA);
  await store.saveClient(clientB);
});

async function beginAuthorization(
  overrides: Partial<{ scopes: string[]; state?: string; resource?: URL; redirectUri: string }> = {},
  client: OAuthClientInformationFull = clientA
): Promise<CapturedRedirect> {
  const { captured, res } = captureRedirect();
  await provider.authorize(
    client,
    {
      redirectUri: overrides.redirectUri ?? REDIRECT_URI,
      codeChallenge: "challenge-value",
      state: "state-123",
      scopes: [SCOPE_READ],
      ...overrides,
    },
    res
  );
  return captured;
}

function requestIdFrom(captured: CapturedRedirect): string {
  const url = new URL(captured.url ?? "", ISSUER);
  const requestId = url.searchParams.get("request");
  if (!requestId) throw new Error("no request id in redirect");
  return requestId;
}

async function obtainCode(uid = "uid-1"): Promise<string> {
  const captured = await beginAuthorization();
  const outcome = await approveAuthorization({ store }, requestIdFrom(captured), uid);
  if (!outcome) throw new Error("authorization was not approved");
  const code = new URL(outcome.redirectTo).searchParams.get("code");
  if (!code) throw new Error("no code in redirect");
  return code;
}

async function exchangeCode(code: string, client: OAuthClientInformationFull = clientA) {
  return provider.exchangeAuthorizationCode(client, code, undefined, REDIRECT_URI, undefined);
}

/* -------------------------------------------------------------------------- */

describe("authorize", () => {
  it("redirects to the consent UI with an unguessable request id", async () => {
    const captured = await beginAuthorization();
    expect(captured.status).toBe(302);
    expect(captured.url?.startsWith("/authorize/ui?request=")).toBe(true);
    expect(requestIdFrom(captured)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("defaults to the read scope when none is requested", async () => {
    const captured = await beginAuthorization({ scopes: [] });
    const request = await store.getAuthRequest(requestIdFrom(captured));
    expect(request?.scopes).toEqual([SCOPE_READ]);
  });

  it("binds the request to the client, redirect_uri, challenge and state", async () => {
    const captured = await beginAuthorization();
    const request = await store.getAuthRequest(requestIdFrom(captured));
    expect(request).toMatchObject({
      clientId: "client-a",
      redirectUri: REDIRECT_URI,
      codeChallenge: "challenge-value",
      state: "state-123",
      resource: "https://connector.example.com/mcp",
    });
  });

  it("bounces an unsupported scope back to the client instead of throwing", async () => {
    const captured = await beginAuthorization({ scopes: [SCOPE_READ, "cadence:write"] });
    const url = new URL(captured.url ?? "");
    expect(url.origin + url.pathname).toBe(REDIRECT_URI);
    expect(url.searchParams.get("error")).toBe("invalid_scope");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code")).toBeNull();
  });

  it("bounces an unknown resource back as invalid_target", async () => {
    const captured = await beginAuthorization({
      resource: new URL("https://someone-else.example.com/mcp"),
    });
    const url = new URL(captured.url ?? "");
    expect(url.searchParams.get("error")).toBe("invalid_target");
  });

  it("accepts the configured resource even with a fragment", async () => {
    const captured = await beginAuthorization({
      resource: new URL("https://connector.example.com/mcp#anchor"),
    });
    expect(captured.url?.startsWith("/authorize/ui?request=")).toBe(true);
  });
});

describe("approve / deny", () => {
  it("issues a code and preserves state on approval", async () => {
    const captured = await beginAuthorization();
    const outcome = await approveAuthorization({ store }, requestIdFrom(captured), "uid-1");
    const url = new URL(outcome?.redirectTo ?? "");
    expect(url.origin + url.pathname).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores only the hash of the authorization code", async () => {
    const captured = await beginAuthorization();
    const outcome = await approveAuthorization({ store }, requestIdFrom(captured), "uid-1");
    const code = new URL(outcome?.redirectTo ?? "").searchParams.get("code") ?? "";
    expect(await store.getAuthCode(code)).toBeUndefined();
    expect(await store.getAuthCode(hashToken(code))).toBeDefined();
  });

  it("consumes the pending request so it cannot be approved twice", async () => {
    const captured = await beginAuthorization();
    const requestId = requestIdFrom(captured);
    expect(await approveAuthorization({ store }, requestId, "uid-1")).toBeDefined();
    expect(await approveAuthorization({ store }, requestId, "uid-1")).toBeUndefined();
  });

  it("returns access_denied with state on denial", async () => {
    const captured = await beginAuthorization();
    const outcome = await denyAuthorization({ store }, requestIdFrom(captured));
    const url = new URL(outcome?.redirectTo ?? "");
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code")).toBeNull();
  });

  it("refuses an expired pending request", async () => {
    await store.createAuthRequest({
      requestId: "r".repeat(43),
      clientId: "client-a",
      redirectUri: REDIRECT_URI,
      codeChallenge: "challenge-value",
      scopes: [SCOPE_READ],
      expiresAt: nowSeconds() - 1,
    });
    expect(await approveAuthorization({ store }, "r".repeat(43), "uid-1")).toBeUndefined();
  });

  it("refuses an unknown request id", async () => {
    expect(await approveAuthorization({ store }, "z".repeat(43), "uid-1")).toBeUndefined();
  });
});

describe("exchangeAuthorizationCode", () => {
  it("completes the code -> token happy path", async () => {
    const code = await obtainCode();
    const challenge = await provider.challengeForAuthorizationCode(clientA, code);
    expect(challenge).toBe("challenge-value");

    const tokens = await exchangeCode(code);
    expect(tokens.token_type).toBe("bearer");
    expect(tokens.scope).toBe(SCOPE_READ);
    expect(tokens.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const info = await verifyAccessToken({ config, signingKey: SIGNING_KEY }, tokens.access_token);
    expect(info.extra).toEqual({ uid: "uid-1" });
    expect(info.clientId).toBe("client-a");
    expect(info.scopes).toEqual([SCOPE_READ]);
  });

  it("rejects a replayed code and does not mint a second token", async () => {
    const code = await obtainCode();
    await exchangeCode(code);

    await expect(exchangeCode(code)).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(provider.challengeForAuthorizationCode(clientA, code)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
  });

  it("rejects an unknown code", async () => {
    await expect(exchangeCode(generateRefreshToken())).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(
      provider.challengeForAuthorizationCode(clientA, generateRefreshToken())
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects an expired code from both entry points", async () => {
    const code = generateRefreshToken();
    await store.createAuthCode({
      codeHash: hashToken(code),
      uid: "uid-1",
      clientId: "client-a",
      redirectUri: REDIRECT_URI,
      codeChallenge: "challenge-value",
      scopes: [SCOPE_READ],
      expiresAt: nowSeconds() - 1,
      used: false,
    });
    await expect(provider.challengeForAuthorizationCode(clientA, code)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
    await expect(exchangeCode(code)).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects a code presented by a different client", async () => {
    const code = await obtainCode();
    await expect(provider.challengeForAuthorizationCode(clientB, code)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
    await expect(
      provider.exchangeAuthorizationCode(clientB, code, undefined, REDIRECT_URI, undefined)
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects a mismatched redirect_uri", async () => {
    const code = await obtainCode();
    await expect(
      provider.exchangeAuthorizationCode(
        clientA,
        code,
        undefined,
        "https://client.example.com/callback-evil",
        undefined
      )
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects an omitted redirect_uri when the code was bound to one", async () => {
    const code = await obtainCode();
    await expect(
      provider.exchangeAuthorizationCode(clientA, code, undefined, undefined, undefined)
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects a resource that is not this connector", async () => {
    const code = await obtainCode();
    await expect(
      provider.exchangeAuthorizationCode(
        clientA,
        code,
        undefined,
        REDIRECT_URI,
        new URL("https://someone-else.example.com/mcp")
      )
    ).rejects.toBeInstanceOf(InvalidTargetError);
  });

  it("stores only the hash of the refresh token", async () => {
    const tokens = await exchangeCode(await obtainCode());
    const refreshToken = tokens.refresh_token ?? "";
    expect(await store.findGrantByRefreshToken(refreshToken)).toBeUndefined();
    const lookup = await store.findGrantByRefreshToken(hashToken(refreshToken));
    expect(lookup?.grant?.refreshTokenHash).toBe(hashToken(refreshToken));
    expect(lookup?.grant?.uid).toBe("uid-1");
  });
});

describe("exchangeRefreshToken", () => {
  async function grantTokens() {
    return exchangeCode(await obtainCode());
  }

  it("rotates the refresh token and keeps the access token usable", async () => {
    const first = await grantTokens();
    const second = await provider.exchangeRefreshToken(clientA, first.refresh_token ?? "");

    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.scope).toBe(SCOPE_READ);

    const info = await verifyAccessToken({ config, signingKey: SIGNING_KEY }, second.access_token);
    expect(info.extra).toEqual({ uid: "uid-1" });
  });

  it("rejects an unknown refresh token", async () => {
    await expect(
      provider.exchangeRefreshToken(clientA, generateRefreshToken())
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("revokes the whole family when a rotated-out token is replayed", async () => {
    const first = await grantTokens();
    const second = await provider.exchangeRefreshToken(clientA, first.refresh_token ?? "");

    // Replaying the superseded token is the compromise signal.
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);

    // ...and it must take the currently-valid token down with it.
    await expect(
      provider.exchangeRefreshToken(clientA, second.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);

    const lookup = await store.findGrantByRefreshToken(hashToken(second.refresh_token ?? ""));
    expect(lookup?.grant?.revoked).toBe(true);
  });

  it("detects reuse of a token rotated out several generations ago", async () => {
    const first = await grantTokens();
    const second = await provider.exchangeRefreshToken(clientA, first.refresh_token ?? "");
    const third = await provider.exchangeRefreshToken(clientA, second.refresh_token ?? "");

    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(
      provider.exchangeRefreshToken(clientA, third.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects a refresh token presented by a different client", async () => {
    const first = await grantTokens();
    await expect(
      provider.exchangeRefreshToken(clientB, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects a revoked grant", async () => {
    const first = await grantTokens();
    await provider.revokeToken?.(clientA, { token: first.refresh_token ?? "" });
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("rejects an expired grant", async () => {
    const refreshToken = generateRefreshToken();
    await store.createGrant({
      grantId: "grant-expired",
      familyId: "family-expired",
      uid: "uid-1",
      clientId: "client-a",
      scopes: [SCOPE_READ],
      refreshTokenHash: hashToken(refreshToken),
      revoked: false,
      createdAt: nowSeconds() - REFRESH_TTL_SECONDS - 10,
      lastUsedAt: nowSeconds() - REFRESH_TTL_SECONDS - 10,
      expiresAt: nowSeconds() - 1,
    });
    await expect(provider.exchangeRefreshToken(clientA, refreshToken)).rejects.toBeInstanceOf(
      InvalidGrantError
    );
  });

  it("refuses to widen scopes", async () => {
    const first = await grantTokens();
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "", [SCOPE_READ, "cadence:write"])
    ).rejects.toBeInstanceOf(InvalidScopeError);
  });

  it("leaves the grant usable after a rejected scope escalation", async () => {
    const first = await grantTokens();
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "", ["cadence:admin"])
    ).rejects.toBeInstanceOf(InvalidScopeError);
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).resolves.toBeDefined();
  });

  it("rejects a resource that is not this connector", async () => {
    const first = await grantTokens();
    await expect(
      provider.exchangeRefreshToken(
        clientA,
        first.refresh_token ?? "",
        undefined,
        new URL("https://someone-else.example.com/mcp")
      )
    ).rejects.toBeInstanceOf(InvalidTargetError);
  });

  it("rejects and revokes when the Cadence account is disabled", async () => {
    const first = await grantTokens();
    users.set("uid-1", { uid: "uid-1", disabled: true });

    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);

    const lookup = await store.findGrantByRefreshToken(hashToken(first.refresh_token ?? ""));
    expect(lookup?.grant?.revoked).toBe(true);
  });

  it("rejects and revokes when the account no longer exists", async () => {
    const first = await grantTokens();
    users.delete("uid-1");
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("forces re-auth when tokensValidAfterTime is later than the grant", async () => {
    const first = await grantTokens();
    users.set("uid-1", {
      uid: "uid-1",
      tokensValidAfterTime: new Date(Date.now() + 60_000).toUTCString(),
    });

    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);

    const lookup = await store.findGrantByRefreshToken(hashToken(first.refresh_token ?? ""));
    expect(lookup?.grant?.revoked).toBe(true);
  });

  it("keeps working when tokensValidAfterTime predates the grant", async () => {
    const first = await grantTokens();
    users.set("uid-1", {
      uid: "uid-1",
      tokensValidAfterTime: new Date(Date.now() - 600_000).toUTCString(),
    });
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).resolves.toBeDefined();
  });
});

/**
 * A momentary Firebase Auth outage must not be mistaken for "this user is
 * gone". Revoking on an indeterminate answer would force the user through the
 * whole OAuth flow again because of a network blip.
 */
describe("exchangeRefreshToken: transient Firebase Auth failures", () => {
  async function grantTokens() {
    return exchangeCode(await obtainCode());
  }

  it("fails closed without revoking when the account lookup errors", async () => {
    const first = await grantTokens();
    authFailure = firebaseAuthError("auth/internal-error");

    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(ServerError);

    const lookup = await store.findGrantByRefreshToken(hashToken(first.refresh_token ?? ""));
    expect(lookup?.grant?.revoked).toBe(false);
  });

  it("lets the client succeed once the outage clears", async () => {
    const first = await grantTokens();
    authFailure = firebaseAuthError("auth/network-error");
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(ServerError);

    authFailure = undefined;
    // The original token is still the live one: rotation never happened.
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).resolves.toBeDefined();
  });

  it("does not rotate the refresh token on a transient failure", async () => {
    const first = await grantTokens();
    authFailure = firebaseAuthError("auth/quota-exceeded");
    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(ServerError);

    const lookup = await store.findGrantByRefreshToken(hashToken(first.refresh_token ?? ""));
    expect(lookup?.superseded).toBe(false);
    expect(lookup?.grant?.refreshTokenHash).toBe(hashToken(first.refresh_token ?? ""));
  });

  it("still revokes on a definitive auth/user-not-found", async () => {
    const first = await grantTokens();
    users.delete("uid-1");

    await expect(
      provider.exchangeRefreshToken(clientA, first.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);

    const lookup = await store.findGrantByRefreshToken(hashToken(first.refresh_token ?? ""));
    expect(lookup?.grant?.revoked).toBe(true);
  });
});

/**
 * Two refreshes with the same valid token: one wins the rotation, the other
 * must be treated as reuse. Otherwise a thief who races the legitimate client
 * gets rejected quietly and the family survives for another attempt.
 */
describe("exchangeRefreshToken: concurrent rotation race", () => {
  async function grantTokens() {
    return exchangeCode(await obtainCode());
  }

  it("revokes the family when two refreshes race on the same token", async () => {
    const first = await grantTokens();
    const token = first.refresh_token ?? "";

    const results = await Promise.allSettled([
      provider.exchangeRefreshToken(clientA, token),
      provider.exchangeRefreshToken(clientA, token),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidGrantError);

    // The winner's brand-new token must be dead too: we cannot tell which of
    // the two callers was the thief.
    const winner = (fulfilled[0] as PromiseFulfilledResult<OAuthTokens>).value;
    await expect(
      provider.exchangeRefreshToken(clientA, winner.refresh_token ?? "")
    ).rejects.toBeInstanceOf(InvalidGrantError);

    const lookup = await store.findGrantByRefreshToken(hashToken(winner.refresh_token ?? ""));
    expect(lookup?.grant?.revoked).toBe(true);
  });

  it("reports a superseded hash distinctly from an absent one", async () => {
    const first = await grantTokens();
    const token = first.refresh_token ?? "";
    const lookup = await store.findGrantByRefreshToken(hashToken(token));
    const grantId = lookup?.grant?.grantId ?? "";

    const rotate = (oldHash: string) =>
      store.rotateRefreshToken({
        grantId,
        oldHash,
        newHash: hashToken(generateRefreshToken()),
        expiresAt: nowSeconds() + REFRESH_TTL_SECONDS,
        now: nowSeconds(),
      });

    expect(await rotate(hashToken(token))).toBe("rotated");
    // Second attempt with the same (now superseded) hash is the race loser.
    expect(await rotate(hashToken(token))).toBe("superseded");
    // A hash the store has never seen is simply unavailable, not reuse.
    expect(await rotate(hashToken(generateRefreshToken()))).toBe("unavailable");
  });

  it("does not revoke the family when rotation fails for an unknown hash", async () => {
    const first = await grantTokens();
    await provider.exchangeRefreshToken(clientA, first.refresh_token ?? "");
    // A grant whose index entry never existed cannot signal reuse.
    await expect(
      provider.exchangeRefreshToken(clientA, generateRefreshToken())
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});

describe("revokeToken", () => {
  it("does not throw on an unknown token", async () => {
    await expect(provider.revokeToken?.(clientA, { token: "nonsense" })).resolves.toBeUndefined();
  });

  it("refuses to let one client revoke another client's grant", async () => {
    const tokens = await exchangeCode(await obtainCode());
    await provider.revokeToken?.(clientB, { token: tokens.refresh_token ?? "" });

    // Still usable: clientB had no business touching it.
    await expect(
      provider.exchangeRefreshToken(clientA, tokens.refresh_token ?? "")
    ).resolves.toBeDefined();
  });
});

describe("client lookup hardening", () => {
  it("treats a path-traversing client_id as an unknown client", async () => {
    // Firestore would otherwise resolve this to mcpClients/x/mcpAuthCodes/y.
    expect(await provider.clientsStore.getClient("client-a/mcpAuthCodes/y")).toBeUndefined();
    expect(await provider.clientsStore.getClient("a/b")).toBeUndefined();
    expect(await provider.clientsStore.getClient("..")).toBeUndefined();
    expect(await provider.clientsStore.getClient("__proto__")).toBeUndefined();
    expect(await provider.clientsStore.getClient("")).toBeUndefined();
  });

  it("still resolves a legitimate client_id", async () => {
    expect(await provider.clientsStore.getClient("client-a")).toBeDefined();
  });
});

describe("clientsStore.registerClient", () => {
  type RegisterInput = Parameters<NonNullable<OAuthRegisteredClientsStore["registerClient"]>>[0];

  /**
   * The SDK's register handler injects client_id and client_secret before
   * calling registerClient, even though its parameter type omits them. Tests
   * reproduce the real runtime shape.
   */
  function registration(client: Partial<OAuthClientInformationFull>): RegisterInput {
    return client as unknown as RegisterInput;
  }

  async function register(client: Partial<OAuthClientInformationFull>) {
    return provider.clientsStore.registerClient?.(registration(client));
  }

  it("persists the generated secret verbatim", async () => {
    const registered = await register({
      client_id: "client-new",
      client_secret: "plaintext-secret",
      redirect_uris: ["https://app.example.com/cb"],
      client_name: "New Client",
    });
    expect(registered?.client_secret).toBe("plaintext-secret");
    const stored = await store.getClient("client-new");
    // Hashing would break the SDK's plaintext client_secret comparison.
    expect(stored?.client_secret).toBe("plaintext-secret");
  });

  it("rejects a javascript: redirect_uri", async () => {
    await expect(
      register({ client_id: "client-evil", redirect_uris: ["javascript:alert(1)"] })
    ).rejects.toBeInstanceOf(InvalidClientMetadataError);
    expect(await store.getClient("client-evil")).toBeUndefined();
  });

  it("rejects a non-loopback http redirect_uri", async () => {
    await expect(
      register({ client_id: "client-plain", redirect_uris: ["http://attacker.example.com/cb"] })
    ).rejects.toBeInstanceOf(InvalidClientMetadataError);
  });

  it("allows a loopback http redirect_uri for native clients", async () => {
    const registered = await register({
      client_id: "client-native",
      redirect_uris: ["http://127.0.0.1:53682/callback"],
    });
    expect(registered?.client_id).toBe("client-native");
  });

  it("rejects a redirect_uri carrying a fragment", async () => {
    await expect(
      register({ client_id: "client-frag", redirect_uris: ["https://app.example.com/cb#x"] })
    ).rejects.toBeInstanceOf(InvalidClientMetadataError);
  });
});
