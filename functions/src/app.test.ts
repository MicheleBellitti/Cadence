import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import { createApp } from "./app.js";
import type { ConnectorConfig } from "./config.js";
import { createMemoryStore, type OAuthStore } from "./oauth/index.js";
import { buildFakeFirestore } from "./mcp/test-helpers.js";
import { resetRateLimiter } from "./rate-limit.js";

/**
 * End-to-end over real HTTP: dynamic client registration, an authorization
 * code obtained through the consent endpoint, a PKCE token exchange, and MCP
 * tool calls with the resulting bearer token.
 *
 * This is the seam neither module can test alone — the OAuth server issuing a
 * token that the resource server then accepts, with the real express routing,
 * real JWT signing and the real Streamable HTTP transport in between. Only
 * Firestore and Firebase Auth are doubles.
 */

const UID = "uid-owner";
const OTHER_UID = "uid-stranger";
const PROJECT_ID = "project-alpha";
const FOREIGN_PROJECT_ID = "project-foreign";
const REDIRECT_URI = "http://127.0.0.1:9876/callback";

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function buildConfig(origin: string): ConnectorConfig {
  const issuerUrl = new URL(origin);
  return {
    issuerUrl,
    resourceUrl: new URL("/mcp", issuerUrl),
    firebaseWebConfig: {
      apiKey: "test-api-key",
      authDomain: "test.firebaseapp.com",
      projectId: "test-project",
    },
  };
}

/** Minimal Firebase Auth double: the ID token is the uid it authenticates. */
function buildFakeAuth(): Auth {
  return {
    verifyIdToken: async (idToken: string) => {
      if (idToken !== `id-token-for-${UID}`) {
        throw new Error("invalid id token");
      }
      return { uid: UID, email: "owner@example.com" };
    },
    getUser: async (uid: string) => ({
      uid,
      disabled: false,
      tokensValidAfterTime: "Thu, 01 Jan 1970 00:00:00 GMT",
    }),
  } as unknown as Auth;
}

function buildDb(): Firestore {
  const today = new Date().toISOString();
  return buildFakeFirestore({
    users: [{ uid: UID, projectId: PROJECT_ID }],
    projects: [
      {
        id: PROJECT_ID,
        name: "Alpha",
        deadline: "2026-12-31",
        ownerId: UID,
        memberIds: [UID],
        activeSprint: null,
        team: [
          {
            id: "member-1",
            name: "Owner",
            color: "#111111",
            role: "Engineer",
            hoursPerDay: 8,
            linkedUserId: UID,
          },
        ],
        items: [
          {
            id: "item-1",
            type: "task",
            title: "Wire up the connector",
            description: "",
            status: "in_progress",
            priority: "critical",
            assigneeIds: ["member-1"],
            estimatedDays: 2,
            dependencies: [],
            tags: [],
            parentId: null,
            sprintId: null,
            order: 0,
            createdAt: today,
            updatedAt: today,
          },
        ],
      },
      {
        id: FOREIGN_PROJECT_ID,
        name: "Somebody else's board",
        ownerId: OTHER_UID,
        memberIds: [OTHER_UID],
      },
    ],
  }) as unknown as Firestore;
}

interface Harness {
  origin: string;
  server: Server;
  store: OAuthStore;
}

async function startHarness(): Promise<Harness> {
  const store = createMemoryStore();
  // The issuer is only known once the OS assigns a port, so bind first and
  // build the app against the resulting origin.
  const placeholder = createApp({
    config: buildConfig("http://127.0.0.1:1"),
    signingKey: "test-signing-key-at-least-32-bytes-long!!",
    db: buildDb(),
    auth: buildFakeAuth(),
    oauthStore: store,
  });
  const probe = placeholder.listen(0);
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  const origin = `http://127.0.0.1:${port}`;
  const app = createApp({
    config: buildConfig(origin),
    signingKey: "test-signing-key-at-least-32-bytes-long!!",
    db: buildDb(),
    auth: buildFakeAuth(),
    oauthStore: store,
  });
  const server = app.listen(port);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return { origin, server, store };
}

async function registerClient(origin: string): Promise<string> {
  const response = await fetch(`${origin}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "E2E Assistant",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { client_id: string; client_secret?: string };
  expect(body.client_secret).toBeUndefined(); // public client: PKCE only
  return body.client_id;
}

/** Runs /authorize → consent → /token and returns the token response. */
async function completeAuthorization(
  origin: string,
  clientId: string
): Promise<{ access_token: string; refresh_token: string; scope: string }> {
  const { verifier, challenge } = pkcePair();

  const authorizeUrl = new URL("/authorize", origin);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", "opaque-state");
  authorizeUrl.searchParams.set("scope", "cadence:read");

  const authorizeResponse = await fetch(authorizeUrl, { redirect: "manual" });
  expect(authorizeResponse.status).toBe(302);
  const uiLocation = new URL(authorizeResponse.headers.get("location") ?? "", origin);
  const requestId = uiLocation.searchParams.get("request");
  expect(requestId).toBeTruthy();

  // The browser page would render here; drive its POST directly.
  const completeResponse = await fetch(`${origin}/authorize/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, idToken: `id-token-for-${UID}` }),
  });
  expect(completeResponse.status).toBe(200);
  const { redirectTo } = (await completeResponse.json()) as { redirectTo: string };
  const callback = new URL(redirectTo);
  expect(callback.searchParams.get("state")).toBe("opaque-state");
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await fetch(`${origin}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
    }),
  });
  expect(tokenResponse.status).toBe(200);
  return (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    scope: string;
  };
}

let rpcId = 0;

async function callMcp(
  origin: string,
  accessToken: string | undefined,
  method: string,
  params?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return fetch(`${origin}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
}

/** The transport answers with SSE by default; pull the single JSON payload out. */
async function readRpcResult(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const dataLine = text
      .split("\n")
      .find((line) => line.startsWith("data:"));
    return JSON.parse((dataLine ?? "data: {}").slice(5).trim()) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function initializeSession(origin: string, accessToken: string): Promise<void> {
  const response = await callMcp(origin, accessToken, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1.0.0" },
  });
  expect(response.status).toBe(200);
}

describe("connector app (end to end over HTTP)", () => {
  let harness: Harness;
  let clientId: string;
  let tokens: { access_token: string; refresh_token: string; scope: string };

  beforeAll(async () => {
    resetRateLimiter();
    harness = await startHarness();
    clientId = await registerClient(harness.origin);
    tokens = await completeAuthorization(harness.origin, clientId);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => harness.server.close(() => resolve()));
  });

  it("advertises authorization server metadata at the origin root", async () => {
    const response = await fetch(`${harness.origin}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);
    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata.issuer).toBe(`${harness.origin}/`);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.registration_endpoint).toBe(`${harness.origin}/register`);
    expect(metadata.revocation_endpoint).toBe(`${harness.origin}/revoke`);
  });

  it("advertises protected resource metadata at the path RFC 9728 requires", async () => {
    const response = await fetch(`${harness.origin}/.well-known/oauth-protected-resource/mcp`);
    expect(response.status).toBe(200);
    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata.resource).toBe(`${harness.origin}/mcp`);
    expect(metadata.authorization_servers).toEqual([`${harness.origin}/`]);
    expect(metadata.scopes_supported).toEqual(["cadence:read"]);
  });

  it("issues a read-only token from the authorization code flow", () => {
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe("cadence:read");
  });

  it("rejects an unauthenticated MCP call and points at the metadata document", async () => {
    const response = await callMcp(harness.origin, undefined, "tools/list");
    expect(response.status).toBe(401);
    const header = response.headers.get("www-authenticate") ?? "";
    expect(header).toContain("Bearer");
    expect(header).toContain(
      `resource_metadata="${harness.origin}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  it("rejects a garbage bearer token", async () => {
    const response = await callMcp(harness.origin, "not-a-real-token", "tools/list");
    expect(response.status).toBe(401);
  });

  it("refuses non-POST methods on the stateless endpoint", async () => {
    const response = await fetch(`${harness.origin}/mcp`, {
      method: "GET",
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("lists only read-only tools", async () => {
    await initializeSession(harness.origin, tokens.access_token);
    const response = await callMcp(harness.origin, tokens.access_token, "tools/list");
    expect(response.status).toBe(200);
    const payload = await readRpcResult(response);
    const tools = (payload.result as { tools: Array<Record<string, unknown>> }).tools;
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "get_at_risk_items",
      "get_board",
      "get_briefing",
      "get_my_tasks",
      "get_sprint_status",
      "get_workload",
      "list_projects",
    ]);
    for (const tool of tools) {
      expect((tool.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
    }
  });

  it("serves a briefing for the authenticated user's project", async () => {
    await initializeSession(harness.origin, tokens.access_token);
    const response = await callMcp(harness.origin, tokens.access_token, "tools/call", {
      name: "get_briefing",
      arguments: {},
    });
    expect(response.status).toBe(200);
    const payload = await readRpcResult(response);
    const result = payload.result as {
      isError?: boolean;
      structuredContent: { project: { id: string; name: string } };
    };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.project.id).toBe(PROJECT_ID);
    expect(result.structuredContent.project.name).toBe("Alpha");
  });

  it("does not leak another user's project through an explicit projectId", async () => {
    await initializeSession(harness.origin, tokens.access_token);
    const response = await callMcp(harness.origin, tokens.access_token, "tools/call", {
      name: "get_briefing",
      arguments: { projectId: FOREIGN_PROJECT_ID },
    });
    const payload = await readRpcResult(response);
    const result = payload.result as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(result.isError).toBe(true);
    const text = result.content.map((entry) => entry.text).join(" ");
    expect(text).toContain("Project not found, or you don't have access to it");
    // The stranger's project name must never appear in the response.
    expect(text).not.toContain("Somebody else's board");
  });

  it("rotates the refresh token and rejects the superseded one", async () => {
    const refresh = async (token: string): Promise<Response> =>
      fetch(`${harness.origin}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token,
          client_id: clientId,
        }),
      });

    const first = await refresh(tokens.refresh_token);
    expect(first.status).toBe(200);
    const rotated = (await first.json()) as { refresh_token: string; access_token: string };
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);

    // Replaying the old token is the classic stolen-token signal: it must fail,
    // and it must also burn the rotated one by revoking the whole family.
    const replay = await refresh(tokens.refresh_token);
    expect(replay.status).toBe(400);

    const afterFamilyRevocation = await refresh(rotated.refresh_token);
    expect(afterFamilyRevocation.status).toBe(400);
  });
});
