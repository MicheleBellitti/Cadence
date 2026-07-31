import type express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Firestore } from "firebase-admin/firestore";
import { registerTools } from "./tools.js";

const SERVER_INFO = { name: "cadence-connector", version: "1.0.0" };

/**
 * Builds one `McpServer` scoped to a single, already-authenticated `uid`.
 * Every tool is registered read-only (`readOnlyHint: true`, `openWorldHint:
 * false`) — this connector never writes to Firestore.
 *
 * Build a fresh instance per request (see `createMcpHandler`): the uid is
 * baked into every registered tool's closure, so there is no server-level
 * state that could leak from one user's request into another's.
 */
export function createMcpServer(deps: { db: Firestore; uid: string }): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  registerTools(server, deps);
  return server;
}

function extractUid(req: express.Request): string | undefined {
  const authInfo = (req as express.Request & { auth?: AuthInfo }).auth;
  const uid = authInfo?.extra?.uid;
  return typeof uid === "string" && uid.length > 0 ? uid : undefined;
}

/**
 * Express handler for `POST /mcp`. Expects `requireBearerAuth` (wired up by
 * the caller — see `app.ts`) to have already populated `req.auth`; this
 * function only reads the uid back out of it.
 *
 * Builds a brand-new `McpServer` + stateless `StreamableHTTPServerTransport`
 * for every single request. Never share either across requests: the uid is
 * closed over by every tool handler, so reusing a server would leak one
 * user's data into another user's session.
 */
export function createMcpHandler(deps: { db: Firestore }): express.RequestHandler {
  return async (req, res) => {
    const uid = extractUid(req);
    if (!uid) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid authentication for this request." },
        id: null,
      });
      return;
    }

    const server = createMcpServer({ db: deps.db, uid });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Internal server error" },
          id: null,
        });
      }
    }
  };
}
