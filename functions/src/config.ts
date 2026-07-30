import { defineSecret } from "firebase-functions/params";

/**
 * HS256 signing key for connector-issued access tokens.
 *
 * Secrets are not materialized during deployment discovery, so `.value()` must
 * only be called from inside a request handler.
 */
export const MCP_TOKEN_KEY = defineSecret("MCP_TOKEN_KEY");

/** The only scope this connector ever issues. Read-only by construction. */
export const SCOPE_READ = "cadence:read";

/** Access token lifetime, in seconds. */
export const ACCESS_TTL_SECONDS = 3600;

/** Refresh token lifetime, in seconds (30 days). */
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Authorization code lifetime, in seconds. Single-use on top of this. */
export const CODE_TTL_SECONDS = 60;

/** How long a pending /authorize UI session stays valid, in seconds. */
export const AUTH_REQUEST_TTL_SECONDS = 600;

/** Region for the connector function — same metro as Firestore (europe-west8). */
export const FUNCTION_REGION = "europe-west8";

export interface ConnectorConfig {
  /** Public origin of this connector, e.g. https://connector-xxx.europe-west8.run.app */
  issuerUrl: URL;
  /** RFC 8707 resource identifier for the MCP endpoint. */
  resourceUrl: URL;
  /** Firebase web SDK config used by the sign-in page (public values). */
  firebaseWebConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
  };
  /** Set when running against the local Auth emulator. */
  authEmulatorHost?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in functions/.env.<project> (see functions/.env.example).`
    );
  }
  return value;
}

/**
 * Read configuration from the environment. Called lazily per cold start, never
 * at module scope, so deployment discovery does not need these values.
 */
export function loadConfig(): ConnectorConfig {
  const issuerUrl = new URL(requireEnv("ISSUER_URL"));
  return {
    issuerUrl,
    resourceUrl: new URL("/mcp", issuerUrl),
    firebaseWebConfig: {
      apiKey: requireEnv("FIREBASE_API_KEY"),
      authDomain: requireEnv("FIREBASE_AUTH_DOMAIN"),
      projectId: requireEnv("FIREBASE_PROJECT_ID"),
    },
    authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  };
}
