import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Auth } from "firebase-admin/auth";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

import { AUTH_REQUEST_TTL_SECONDS, SCOPE_READ, type ConnectorConfig } from "../config.js";
import { createOAuthProvider } from "./provider.js";
import { createOAuthRouter } from "./routes.js";
import { createMemoryStore, type OAuthStore } from "./store.js";
import { generateOpaqueToken } from "./tokens.js";
import { nowSeconds } from "./util.js";

const ISSUER = "https://connector.example.com/";
const REDIRECT_URI = "https://client.example.com/callback";

const config: ConnectorConfig = {
  issuerUrl: new URL(ISSUER),
  resourceUrl: new URL("/mcp", ISSUER),
  firebaseWebConfig: { apiKey: "api-key-123", authDomain: "cadence.example.com", projectId: "p" },
};

const client: OAuthClientInformationFull = {
  client_id: "client-a",
  client_secret: "secret-a",
  redirect_uris: [REDIRECT_URI],
  client_name: "Claude Desktop",
};

/** Accepts "id:<uid>" as a valid ID token; anything else is rejected. */
function makeFakeAuth(): Auth {
  return {
    async verifyIdToken(idToken: string, _checkRevoked?: boolean) {
      if (!idToken.startsWith("id:")) throw new Error("auth/argument-error");
      return { uid: idToken.slice(3) };
    },
    async getUser(uid: string) {
      return { uid, disabled: false, tokensValidAfterTime: undefined };
    },
  } as unknown as Auth;
}

let store: OAuthStore;
let server: http.Server;
let base: string;

beforeAll(async () => {
  store = createMemoryStore();
  const auth = makeFakeAuth();
  const provider = createOAuthProvider({ config, signingKey: "signing-key", store, auth });
  const app = express();
  app.use(createOAuthRouter({ config, store, auth, provider }));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

beforeEach(async () => {
  await store.saveClient(client);
});

async function pendingRequest(overrides: { expiresAt?: number } = {}): Promise<string> {
  const requestId = generateOpaqueToken();
  await store.createAuthRequest({
    requestId,
    clientId: client.client_id,
    redirectUri: REDIRECT_URI,
    codeChallenge: "challenge-value",
    state: "state-123",
    scopes: [SCOPE_READ],
    resource: "https://connector.example.com/mcp",
    expiresAt: overrides.expiresAt ?? nowSeconds() + AUTH_REQUEST_TTL_SECONDS,
  });
  return requestId;
}

function complete(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/authorize/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("GET /authorize/ui", () => {
  it("serves the consent page rather than falling into the SDK's /authorize handler", async () => {
    const requestId = await pendingRequest();
    const response = await fetch(`${base}/authorize/ui?request=${requestId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Claude Desktop");
    expect(html).toContain("<strong>read-only</strong>");
  });

  it("sets the hardening headers", async () => {
    const requestId = await pendingRequest();
    const response = await fetch(`${base}/authorize/ui?request=${requestId}`);

    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("renders an error page, never a redirect, for a malformed request id", async () => {
    const response = await fetch(`${base}/authorize/ui?request=not-a-valid-id`, {
      redirect: "manual",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("not valid");
  });

  it("rejects a missing request id", async () => {
    const response = await fetch(`${base}/authorize/ui`);
    expect(response.status).toBe(400);
  });

  it("rejects an expired request without leaking the redirect_uri", async () => {
    const requestId = await pendingRequest({ expiresAt: nowSeconds() - 1 });
    const response = await fetch(`${base}/authorize/ui?request=${requestId}`);
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("expired");
    expect(html).not.toContain(REDIRECT_URI);
  });
});

describe("POST /authorize/complete", () => {
  it("issues a code and preserves state", async () => {
    const requestId = await pendingRequest();
    const response = await complete({ requestId, idToken: "id:uid-1" });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { redirectTo: string };
    const url = new URL(payload.redirectTo);
    expect(url.origin + url.pathname).toBe(REDIRECT_URI);
    expect(url.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("returns access_denied when the user cancels", async () => {
    const requestId = await pendingRequest();
    const response = await complete({ requestId, denied: true });

    const payload = (await response.json()) as { redirectTo: string };
    const url = new URL(payload.redirectTo);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("consumes the request so it cannot be replayed", async () => {
    const requestId = await pendingRequest();
    expect((await complete({ requestId, idToken: "id:uid-1" })).status).toBe(200);

    const replay = await complete({ requestId, idToken: "id:uid-1" });
    expect(replay.status).toBe(400);
  });

  it("does not burn the pending request when the ID token is rejected", async () => {
    const requestId = await pendingRequest();
    expect((await complete({ requestId, idToken: "forged" })).status).toBe(400);

    // The user can retry sign-in on the same page.
    expect((await complete({ requestId, idToken: "id:uid-1" })).status).toBe(200);
  });

  it("gives the same answer for a bad token, an unknown id and a malformed id", async () => {
    const requestId = await pendingRequest();
    const responses = await Promise.all([
      complete({ requestId, idToken: "forged" }),
      complete({ requestId: generateOpaqueToken(), idToken: "id:uid-1" }),
      complete({ requestId: "short", idToken: "id:uid-1" }),
      complete({ requestId }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
  });

  it("rejects a cross-origin post", async () => {
    const requestId = await pendingRequest();
    const response = await complete({ requestId, idToken: "id:uid-1" }, {
      origin: "https://evil.example.com",
    });
    expect(response.status).toBe(400);
  });

  it("accepts a same-origin post", async () => {
    const requestId = await pendingRequest();
    const response = await complete({ requestId, idToken: "id:uid-1" }, {
      origin: config.issuerUrl.origin,
    });
    expect(response.status).toBe(200);
  });

  it("ignores a cross-site form post that cannot set a JSON content type", async () => {
    const requestId = await pendingRequest();
    const response = await fetch(`${base}/authorize/complete`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ requestId, idToken: "id:uid-1" }).toString(),
    });
    expect(response.status).toBe(400);
  });

  it("never advertises CORS access", async () => {
    const requestId = await pendingRequest();
    const response = await complete({ requestId, denied: true });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("end-to-end authorization code flow", () => {
  function pkce(): { verifier: string; challenge: string } {
    const verifier = generateOpaqueToken();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }

  async function registerClient(): Promise<{ clientId: string; clientSecret: string }> {
    const response = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "E2E Client",
        redirect_uris: [REDIRECT_URI],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    expect(response.status).toBe(201);
    const registered = (await response.json()) as Record<string, unknown>;
    // clientSecretExpirySeconds: 0 — a personal connector must not break in 30 days.
    expect(registered.client_secret_expires_at).toBe(0);
    return {
      clientId: String(registered.client_id),
      clientSecret: String(registered.client_secret),
    };
  }

  async function authorizeToCode(
    clientId: string,
    challenge: string
  ): Promise<{ code: string; state: string | null }> {
    const authorizeUrl = new URL(`${base}/authorize`);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", SCOPE_READ);
    authorizeUrl.searchParams.set("state", "e2e-state");

    const redirected = await fetch(authorizeUrl, { redirect: "manual" });
    expect(redirected.status).toBe(302);
    const location = redirected.headers.get("location") ?? "";
    expect(location.startsWith("/authorize/ui?request=")).toBe(true);

    const requestId = new URL(location, base).searchParams.get("request") ?? "";
    const completed = await complete({ requestId, idToken: "id:uid-1" });
    expect(completed.status).toBe(200);

    const { redirectTo } = (await completed.json()) as { redirectTo: string };
    const target = new URL(redirectTo);
    return { code: target.searchParams.get("code") ?? "", state: target.searchParams.get("state") };
  }

  function tokenRequest(body: Record<string, string>): Promise<Response> {
    return fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }

  it("registers, authorizes, exchanges and refreshes", async () => {
    const { clientId, clientSecret } = await registerClient();
    const { verifier, challenge } = pkce();
    const { code, state } = await authorizeToCode(clientId, challenge);
    expect(state).toBe("e2e-state");

    const tokenResponse = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(tokenResponse.status).toBe(200);
    const tokens = (await tokenResponse.json()) as Record<string, string>;
    expect(tokens.token_type).toBe("bearer");
    expect(tokens.scope).toBe(SCOPE_READ);

    const refreshResponse = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()) as Record<string, string>;
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
  });

  it("rejects a code_verifier that does not match the challenge", async () => {
    const { clientId, clientSecret } = await registerClient();
    const { challenge } = pkce();
    const { code } = await authorizeToCode(clientId, challenge);

    const response = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: generateOpaqueToken(),
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error?: string }).error).toBe("invalid_grant");
  });

  it("rejects a stolen code replayed with the wrong client credentials", async () => {
    const victim = await registerClient();
    const attacker = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorizeToCode(victim.clientId, challenge);

    const response = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
      client_id: attacker.clientId,
      client_secret: attacker.clientSecret,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error?: string }).error).toBe("invalid_grant");
  });

  it("rejects a bad client_secret", async () => {
    const { clientId } = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorizeToCode(clientId, challenge);

    const response = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: "wrong-secret",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error?: string }).error).toBe("invalid_client");
  });

  it("revokes a refresh token through /revoke", async () => {
    const { clientId, clientSecret } = await registerClient();
    const { verifier, challenge } = pkce();
    const { code } = await authorizeToCode(clientId, challenge);

    const tokens = (await (
      await tokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      })
    ).json()) as Record<string, string>;

    const revoked = await fetch(`${base}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokens.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    expect(revoked.status).toBe(200);

    const afterRevoke = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(afterRevoke.status).toBe(400);
  });

  it("bounces an unsupported scope back to the client's redirect_uri", async () => {
    const { clientId } = await registerClient();
    const { challenge } = pkce();

    const authorizeUrl = new URL(`${base}/authorize`);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("scope", "cadence:write");
    authorizeUrl.searchParams.set("state", "e2e-state");

    const response = await fetch(authorizeUrl, { redirect: "manual" });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("invalid_scope");
    expect(location.searchParams.get("state")).toBe("e2e-state");
  });

  it("refuses plain PKCE, leaving S256 the only option", async () => {
    const { clientId } = await registerClient();
    const authorizeUrl = new URL(`${base}/authorize`);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("code_challenge", "plain-challenge");
    authorizeUrl.searchParams.set("code_challenge_method", "plain");

    const response = await fetch(authorizeUrl, { redirect: "manual" });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });
});

describe("metadata endpoints", () => {
  it("advertises the authorization server", async () => {
    const response = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);
    const metadata = (await response.json()) as Record<string, unknown>;

    expect(metadata.issuer).toBe(ISSUER);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(metadata.scopes_supported).toEqual([SCOPE_READ]);
    expect(metadata.registration_endpoint).toBe("https://connector.example.com/register");
    expect(metadata.revocation_endpoint).toBe("https://connector.example.com/revoke");
  });

  it("advertises the protected resource at its RFC 9728 path", async () => {
    const response = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(response.status).toBe(200);
    const metadata = (await response.json()) as Record<string, unknown>;

    expect(metadata.resource).toBe("https://connector.example.com/mcp");
    expect(metadata.authorization_servers).toEqual([ISSUER]);
    expect(metadata.scopes_supported).toEqual([SCOPE_READ]);
  });
});
