# Cadence Connector

A **read-only** remote MCP server that lets AI assistants — Claude (including the morning briefing), ChatGPT, and Gemini — report on your Cadence board without ever receiving your Cadence credentials.

## Why it is built this way

Cadence signs users in with Firebase Auth and stores everything in Firestore, where `firestore.rules` enforces that the caller's uid appears in `project.memberIds`. An AI assistant cannot satisfy that check: it has no Firebase session, and handing it your email and password would give it unrestricted, non-revocable access to everything.

The connector is an OAuth 2.1 authorization server in front of a small MCP resource server:

```
Assistant ──(1) dynamic client registration──▶ connector
Assistant ──(2) /authorize ─────────────────▶ connector ──▶ browser sign-in page
   You ─────(3) sign in with Firebase ───────────────────▶ Google (password never touches the connector)
   You ─────(4) approve read-only access ────▶ connector
Assistant ◀─(5) authorization code + PKCE ─── connector
Assistant ──(6) /token ─────────────────────▶ connector ──▶ access token (1h) + refresh token (30d)
Assistant ──(7) POST /mcp with Bearer token ▶ connector ──▶ Firestore (Admin SDK)
```

What the assistant ends up holding is a token **issued by the connector**, scoped to `cadence:read`, bound to the connector's own resource identifier, expiring in an hour, and revocable — not your password.

## Security model

| Control | Where |
|---|---|
| Password only ever goes to Google | the sign-in page runs the Firebase **client** SDK; the connector receives an ID token and verifies it with the Admin SDK |
| PKCE S256 required | enforced by the MCP SDK's token handler; `plain` is rejected outright |
| Authorization codes | single-use, consumed inside a Firestore transaction, 60-second lifetime, bound to client + redirect URI + PKCE challenge |
| Access tokens | HS256 JWT, 1 hour, `aud` pinned to the connector's `/mcp` resource, scope `cadence:read` |
| Refresh tokens | opaque, stored only as a SHA-256 hash, rotated on every use; replaying a rotated token revokes the whole token family |
| Password change / disabled account | on refresh the connector checks `tokensValidAfterTime` and `disabled` and kills the grant |
| Project access | **`authorizeProjectAccess` on every tool call** — the Admin SDK bypasses Firestore rules, so the connector re-checks `uid ∈ memberIds` itself; a non-member gets the same error as for a nonexistent project, so project IDs cannot be probed |
| Write protection | no write tool exists, and the only issuable scope is `cadence:read` |
| Connector state | `mcpClients`, `mcpAuthRequests`, `mcpAuthCodes`, `mcpGrants`, `mcpGrantTokens` are denied to every client SDK in `firestore.rules` |

**Known trade-off:** an access token stays valid for up to an hour after you change your Cadence password. Refresh is blocked immediately; only the already-issued access token survives its remaining lifetime. Revoke explicitly (below) if that matters.

**Load-bearing assumption:** the connector's isolation is exactly as strong as the integrity of `projects/{id}.memberIds`. Anything that can write that array can grant itself connector access, so the invite rules in `firestore.rules` bind an invite's document ID to its own `projectId` field — without that binding, a member of any project could mint an invite naming a project they don't belong to and add themselves to it.

## Tools

All tools are read-only and take an optional `projectId` (defaulting to your currently selected project).

| Tool | Purpose |
|---|---|
| `list_projects` | Projects you are a member of |
| `get_briefing` | The morning-briefing composite: sprint progress, your tasks, at-risk items, critical-path preview, deadline |
| `get_my_tasks` | Items assigned to you, priority-sorted |
| `get_board` | Kanban columns by status |
| `get_sprint_status` | Sprint progress and burndown summary |
| `get_at_risk_items` | Overdue or critical-path items |
| `get_workload` | Per-person load against capacity |

Scheduling, critical path, and workload are computed with the same pure functions the web UI uses (`src/lib/scheduler.ts`, `critical-path.ts`, `workload.ts`, `dashboard-utils.ts`), so the connector and the dashboard can never disagree.

## Connecting an assistant

The connector is a vanilla spec-compliant MCP server; nothing about it is assistant-specific.

**Claude** — Settings → Connectors → Add custom connector → URL `https://<connector-origin>/mcp`. Registration and OAuth happen automatically; sign in and approve. Then enable the connector where you want it, including in the morning briefing.

**ChatGPT** — Settings → Connectors (developer mode) → add an MCP server with the same URL.

**Gemini CLI** — in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "cadence": {
      "httpUrl": "https://<connector-origin>/mcp",
      "oauth": { "enabled": true }
    }
  }
}
```

## Revoking access

- Remove the connector in the assistant's settings — it stops using the token.
- To invalidate the tokens themselves, delete or set `revoked: true` on the relevant `mcpGrants` document in the Firebase console. Deleting the `mcpClients` document blocks that client from ever refreshing or re-authorizing.
- Changing your Cadence password blocks all refreshes within the hour.

## Local development

The Functions emulator serves functions under `/<project>/<region>/<name>`, but OAuth metadata documents must live at the origin root — so run the connector as a plain local server against the emulators instead:

```bash
firebase emulators:start --only firestore,auth
```

```bash
npm --prefix functions run seed
```

```bash
npm --prefix functions run dev
```

Then point the MCP Inspector at `http://127.0.0.1:8787/mcp`:

```bash
npx @modelcontextprotocol/inspector
```

## Deployment

Prerequisite: the Firebase project must be on the **Blaze** plan (gen2 functions and Secret Manager). Usage for a personal connector sits inside the free tier.

1. Deploy the rules that lock down the connector's collections:

```bash
firebase deploy --only firestore:rules
```

2. Create the token signing key:

```bash
firebase functions:secrets:set MCP_TOKEN_KEY
```

Paste the output of `openssl rand -base64 48`.

3. Create `functions/.env.cadence-e2c93` from `functions/.env.example`. The Firebase web values are the same public ones the app uses. Leave `ISSUER_URL` as a placeholder for now.

4. Deploy:

```bash
firebase deploy --only functions:connector
```

5. Take the function's **Cloud Run (`run.app`) URL** from the deploy output — not the `cloudfunctions.net` alias, which prefixes every path with the function name and would put the `.well-known` documents out of reach. Put it in `ISSUER_URL` and deploy again.

6. Enable TTL cleanup on the expiring collections:

```bash
gcloud firestore fields ttls update expiresAt --collection-group=mcpAuthRequests --enable-ttl
```

Repeat for `mcpAuthCodes`, `mcpGrants`, and `mcpGrantTokens`. TTL is hygiene only — expiry is always enforced in code.

7. Add the `run.app` host to Firebase Auth → Settings → Authorized domains.

8. Smoke test:

```bash
curl https://<connector-origin>/.well-known/oauth-protected-resource/mcp
```

A `POST /mcp` without a token must return 401 with a `WWW-Authenticate` header pointing at that metadata URL.
