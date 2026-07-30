import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { nowSeconds } from "./util.js";

/**
 * Top-level Firestore collections. Every one of them is written and read only
 * through the Admin SDK, so security rules must deny all client access.
 */
export const CLIENTS_COLLECTION = "mcpClients";
export const AUTH_REQUESTS_COLLECTION = "mcpAuthRequests";
export const AUTH_CODES_COLLECTION = "mcpAuthCodes";
export const GRANTS_COLLECTION = "mcpGrants";
export const GRANT_TOKENS_COLLECTION = "mcpGrantTokens";

/** Fields carrying a Firestore `Timestamp` so a TTL policy can reap the docs. */
export const TTL_FIELD = "expiresAt";

/** A pending `/authorize` interaction, awaiting the user at `/authorize/ui`. */
export interface StoredAuthRequest {
  /** 32 random bytes, base64url. Doubles as the CSRF token for the UI. */
  requestId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  /** RFC 8707 resource identifier, already normalized (no fragment). */
  resource?: string;
  expiresAt: number;
}

/** An issued authorization code, keyed by sha256 of the code itself. */
export interface StoredAuthCode {
  codeHash: string;
  uid: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
  used: boolean;
}

/** A long-lived authorization grant backing one refresh-token family. */
export interface StoredGrant {
  grantId: string;
  uid: string;
  clientId: string;
  scopes: string[];
  /** sha256 hex of the *current* refresh token. Raw tokens are never stored. */
  refreshTokenHash: string;
  familyId: string;
  revoked: boolean;
  /** Grant creation time — compared against `tokensValidAfterTime`. */
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

/**
 * Result of resolving a presented refresh token.
 *
 * `superseded` is the reuse-detection signal: it is true when the presented
 * hash was rotated out of the family but is still on record. `grant` may be
 * absent if the grant document was reaped while an index entry survived.
 */
export interface RefreshTokenLookup {
  familyId: string;
  superseded: boolean;
  grant?: StoredGrant;
}

export interface RotateRefreshTokenParams {
  grantId: string;
  oldHash: string;
  newHash: string;
  /** New absolute expiry for the grant (refresh lifetime slides on rotation). */
  expiresAt: number;
  now: number;
}

/**
 * Why a rotation attempt ended the way it did.
 *
 * `superseded` is load-bearing: it means the presented hash was rotated out
 * between the caller's read and this write — i.e. the caller lost a race with
 * a concurrent refresh. That is indistinguishable from replaying a stolen
 * token, so callers must treat it exactly like up-front reuse detection and
 * revoke the family. Collapsing it into a plain failure would let a thief who
 * wins the race slip through undetected.
 */
export type RotateRefreshTokenOutcome = "rotated" | "superseded" | "unavailable";

export interface OAuthStore {
  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
  saveClient(client: OAuthClientInformationFull): Promise<void>;

  createAuthRequest(request: StoredAuthRequest): Promise<void>;
  getAuthRequest(requestId: string): Promise<StoredAuthRequest | undefined>;
  /** Atomically read and delete. Single use: a second call returns undefined. */
  consumeAuthRequest(requestId: string): Promise<StoredAuthRequest | undefined>;

  createAuthCode(code: StoredAuthCode): Promise<void>;
  getAuthCode(codeHash: string): Promise<StoredAuthCode | undefined>;
  /**
   * Atomically read and mark used. Returns undefined when the code is unknown,
   * already redeemed or expired, so a replay can never mint a second token.
   */
  consumeAuthCode(codeHash: string): Promise<StoredAuthCode | undefined>;

  createGrant(grant: StoredGrant): Promise<void>;
  findGrantByRefreshToken(refreshTokenHash: string): Promise<RefreshTokenLookup | undefined>;
  rotateRefreshToken(params: RotateRefreshTokenParams): Promise<RotateRefreshTokenOutcome>;
  revokeGrantFamily(familyId: string): Promise<void>;
}

/**
 * Firestore treats "/" inside a document id as a path separator, so an
 * unvalidated `client_id` arriving on /authorize or /token would resolve to a
 * nested path (`mcpClients/x/mcpAuthCodes/y`) or throw on an even segment
 * count. Reject anything that is not a plain single-segment id, so a hostile
 * id becomes a clean "unknown client" instead of a traversal or a 500.
 */
export function isSafeDocumentId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= 1500 &&
    !id.includes("/") &&
    id !== "." &&
    id !== ".." &&
    !/^__.*__$/.test(id)
  );
}

/* -------------------------------------------------------------------------- */
/* Firestore implementation                                                    */
/* -------------------------------------------------------------------------- */

function readString(data: DocumentData, field: string): string | undefined {
  const value: unknown = data[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(data: DocumentData, field: string): string[] {
  const value: unknown = data[field];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readBoolean(data: DocumentData, field: string): boolean {
  return data[field] === true;
}

function readEpochSeconds(data: DocumentData, field: string): number | undefined {
  const value: unknown = data[field];
  if (value instanceof Timestamp) return value.seconds;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function toAuthRequest(requestId: string, data: DocumentData): StoredAuthRequest | undefined {
  const clientId = readString(data, "clientId");
  const redirectUri = readString(data, "redirectUri");
  const codeChallenge = readString(data, "codeChallenge");
  const expiresAt = readEpochSeconds(data, "expiresAt");
  if (!clientId || !redirectUri || !codeChallenge || expiresAt === undefined) return undefined;
  return {
    requestId,
    clientId,
    redirectUri,
    codeChallenge,
    state: readString(data, "state"),
    scopes: readStringArray(data, "scopes"),
    resource: readString(data, "resource"),
    expiresAt,
  };
}

function toAuthCode(codeHash: string, data: DocumentData): StoredAuthCode | undefined {
  const uid = readString(data, "uid");
  const clientId = readString(data, "clientId");
  const redirectUri = readString(data, "redirectUri");
  const codeChallenge = readString(data, "codeChallenge");
  const expiresAt = readEpochSeconds(data, "expiresAt");
  if (!uid || !clientId || !redirectUri || !codeChallenge || expiresAt === undefined) return undefined;
  return {
    codeHash,
    uid,
    clientId,
    redirectUri,
    codeChallenge,
    scopes: readStringArray(data, "scopes"),
    resource: readString(data, "resource"),
    expiresAt,
    used: readBoolean(data, "used"),
  };
}

function toGrant(grantId: string, data: DocumentData): StoredGrant | undefined {
  const uid = readString(data, "uid");
  const clientId = readString(data, "clientId");
  const refreshTokenHash = readString(data, "refreshTokenHash");
  const familyId = readString(data, "familyId");
  const createdAt = readEpochSeconds(data, "createdAt");
  const lastUsedAt = readEpochSeconds(data, "lastUsedAt");
  const expiresAt = readEpochSeconds(data, "expiresAt");
  if (
    !uid ||
    !clientId ||
    !refreshTokenHash ||
    !familyId ||
    createdAt === undefined ||
    lastUsedAt === undefined ||
    expiresAt === undefined
  ) {
    return undefined;
  }
  return {
    grantId,
    uid,
    clientId,
    scopes: readStringArray(data, "scopes"),
    refreshTokenHash,
    familyId,
    revoked: readBoolean(data, "revoked"),
    createdAt,
    lastUsedAt,
    expiresAt,
  };
}

/** Firestore rejects `undefined` field values, so optional fields are omitted. */
function withOptional(base: DocumentData, optional: Record<string, string | undefined>): DocumentData {
  const out: DocumentData = { ...base };
  for (const [field, value] of Object.entries(optional)) {
    if (value !== undefined) out[field] = value;
  }
  return out;
}

export function createFirestoreStore(db: Firestore): OAuthStore {
  const clients = db.collection(CLIENTS_COLLECTION);
  const authRequests = db.collection(AUTH_REQUESTS_COLLECTION);
  const authCodes = db.collection(AUTH_CODES_COLLECTION);
  const grants = db.collection(GRANTS_COLLECTION);
  const grantTokens = db.collection(GRANT_TOKENS_COLLECTION);

  async function revokeGrantFamily(familyId: string): Promise<void> {
    const snapshot = await grants.where("familyId", "==", familyId).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.update(doc.ref, { revoked: true });
    }
    await batch.commit();
  }

  return {
    async getClient(clientId) {
      if (!isSafeDocumentId(clientId)) return undefined;
      const snapshot = await clients.doc(clientId).get();
      const data = snapshot.data();
      if (!data) return undefined;
      // Re-validate on read: a malformed or tampered document must never reach
      // redirect_uri matching or client-secret comparison.
      const parsed = OAuthClientInformationFullSchema.safeParse(data);
      return parsed.success ? parsed.data : undefined;
    },

    async saveClient(client) {
      await clients.doc(client.client_id).set(client);
    },

    async createAuthRequest(request) {
      await authRequests.doc(request.requestId).set(
        withOptional(
          {
            clientId: request.clientId,
            redirectUri: request.redirectUri,
            codeChallenge: request.codeChallenge,
            scopes: request.scopes,
            expiresAt: Timestamp.fromMillis(request.expiresAt * 1000),
          },
          { state: request.state, resource: request.resource }
        )
      );
    },

    async getAuthRequest(requestId) {
      if (!isSafeDocumentId(requestId)) return undefined;
      const snapshot = await authRequests.doc(requestId).get();
      const data = snapshot.data();
      return data ? toAuthRequest(requestId, data) : undefined;
    },

    async consumeAuthRequest(requestId) {
      if (!isSafeDocumentId(requestId)) return undefined;
      const ref = authRequests.doc(requestId);
      return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const data = snapshot.data();
        if (!data) return undefined;
        tx.delete(ref);
        const record = toAuthRequest(requestId, data);
        if (!record || record.expiresAt <= nowSeconds()) return undefined;
        return record;
      });
    },

    async createAuthCode(code) {
      await authCodes.doc(code.codeHash).set(
        withOptional(
          {
            uid: code.uid,
            clientId: code.clientId,
            redirectUri: code.redirectUri,
            codeChallenge: code.codeChallenge,
            scopes: code.scopes,
            used: code.used,
            expiresAt: Timestamp.fromMillis(code.expiresAt * 1000),
          },
          { resource: code.resource }
        )
      );
    },

    async getAuthCode(codeHash) {
      const snapshot = await authCodes.doc(codeHash).get();
      const data = snapshot.data();
      return data ? toAuthCode(codeHash, data) : undefined;
    },

    async consumeAuthCode(codeHash) {
      const ref = authCodes.doc(codeHash);
      return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const data = snapshot.data();
        if (!data) return undefined;
        const record = toAuthCode(codeHash, data);
        if (!record || record.used) return undefined;
        // Burn it even if expired: a redeemed-once marker is cheap insurance.
        tx.update(ref, { used: true });
        if (record.expiresAt <= nowSeconds()) return undefined;
        return { ...record, used: true };
      });
    },

    async createGrant(grant) {
      const expiresAt = Timestamp.fromMillis(grant.expiresAt * 1000);
      const batch = db.batch();
      batch.set(grants.doc(grant.grantId), {
        uid: grant.uid,
        clientId: grant.clientId,
        scopes: grant.scopes,
        refreshTokenHash: grant.refreshTokenHash,
        familyId: grant.familyId,
        revoked: grant.revoked,
        createdAt: Timestamp.fromMillis(grant.createdAt * 1000),
        lastUsedAt: Timestamp.fromMillis(grant.lastUsedAt * 1000),
        expiresAt,
      });
      batch.set(grantTokens.doc(grant.refreshTokenHash), {
        grantId: grant.grantId,
        familyId: grant.familyId,
        superseded: false,
        expiresAt,
      });
      await batch.commit();
    },

    async findGrantByRefreshToken(refreshTokenHash) {
      const indexSnapshot = await grantTokens.doc(refreshTokenHash).get();
      const indexData = indexSnapshot.data();
      if (!indexData) return undefined;
      const grantId = readString(indexData, "grantId");
      const familyId = readString(indexData, "familyId");
      if (!grantId || !familyId) return undefined;
      const grantSnapshot = await grants.doc(grantId).get();
      const grantData = grantSnapshot.data();
      return {
        familyId,
        superseded: readBoolean(indexData, "superseded"),
        grant: grantData ? toGrant(grantId, grantData) : undefined,
      };
    },

    async rotateRefreshToken({ grantId, oldHash, newHash, expiresAt, now }) {
      const oldIndexRef = grantTokens.doc(oldHash);
      const newIndexRef = grantTokens.doc(newHash);
      const grantRef = grants.doc(grantId);
      const expiry = Timestamp.fromMillis(expiresAt * 1000);
      return db.runTransaction<RotateRefreshTokenOutcome>(async (tx) => {
        const [oldIndexSnapshot, grantSnapshot] = await Promise.all([tx.get(oldIndexRef), tx.get(grantRef)]);
        const oldIndexData = oldIndexSnapshot.data();
        const grantData = grantSnapshot.data();
        if (!oldIndexData) return "unavailable";
        // Someone else rotated this hash first: report it so the caller can
        // revoke the family rather than treating it as a benign failure.
        if (readBoolean(oldIndexData, "superseded")) return "superseded";
        if (!grantData || readBoolean(grantData, "revoked")) return "unavailable";
        const familyId = readString(oldIndexData, "familyId");
        if (!familyId) return "unavailable";
        tx.update(oldIndexRef, { superseded: true });
        tx.set(newIndexRef, { grantId, familyId, superseded: false, expiresAt: expiry });
        tx.update(grantRef, {
          refreshTokenHash: newHash,
          lastUsedAt: Timestamp.fromMillis(now * 1000),
          expiresAt: expiry,
        });
        return "rotated";
      });
    },

    revokeGrantFamily,
  };
}

/* -------------------------------------------------------------------------- */
/* In-memory implementation (tests and local development)                      */
/* -------------------------------------------------------------------------- */

interface MemoryTokenIndex {
  grantId: string;
  familyId: string;
  superseded: boolean;
}

/**
 * Mirrors the Firestore semantics exactly. Read-modify-write sequences contain
 * no `await`, so they are atomic under Node's single-threaded event loop.
 */
export function createMemoryStore(): OAuthStore {
  const clients = new Map<string, OAuthClientInformationFull>();
  const authRequests = new Map<string, StoredAuthRequest>();
  const authCodes = new Map<string, StoredAuthCode>();
  const grants = new Map<string, StoredGrant>();
  const tokenIndex = new Map<string, MemoryTokenIndex>();

  function revokeFamily(familyId: string): void {
    for (const [grantId, grant] of grants) {
      if (grant.familyId === familyId) grants.set(grantId, { ...grant, revoked: true });
    }
  }

  return {
    // The id guards mirror the Firestore store so both behave identically.
    async getClient(clientId) {
      if (!isSafeDocumentId(clientId)) return undefined;
      const client = clients.get(clientId);
      return client ? structuredClone(client) : undefined;
    },

    async saveClient(client) {
      clients.set(client.client_id, structuredClone(client));
    },

    async createAuthRequest(request) {
      authRequests.set(request.requestId, structuredClone(request));
    },

    async getAuthRequest(requestId) {
      if (!isSafeDocumentId(requestId)) return undefined;
      const record = authRequests.get(requestId);
      return record ? structuredClone(record) : undefined;
    },

    async consumeAuthRequest(requestId) {
      if (!isSafeDocumentId(requestId)) return undefined;
      const record = authRequests.get(requestId);
      if (!record) return undefined;
      authRequests.delete(requestId);
      if (record.expiresAt <= nowSeconds()) return undefined;
      return structuredClone(record);
    },

    async createAuthCode(code) {
      authCodes.set(code.codeHash, structuredClone(code));
    },

    async getAuthCode(codeHash) {
      const record = authCodes.get(codeHash);
      return record ? structuredClone(record) : undefined;
    },

    async consumeAuthCode(codeHash) {
      const record = authCodes.get(codeHash);
      if (!record || record.used) return undefined;
      authCodes.set(codeHash, { ...record, used: true });
      if (record.expiresAt <= nowSeconds()) return undefined;
      return structuredClone({ ...record, used: true });
    },

    async createGrant(grant) {
      grants.set(grant.grantId, structuredClone(grant));
      tokenIndex.set(grant.refreshTokenHash, {
        grantId: grant.grantId,
        familyId: grant.familyId,
        superseded: false,
      });
    },

    async findGrantByRefreshToken(refreshTokenHash) {
      const index = tokenIndex.get(refreshTokenHash);
      if (!index) return undefined;
      const grant = grants.get(index.grantId);
      return {
        familyId: index.familyId,
        superseded: index.superseded,
        grant: grant ? structuredClone(grant) : undefined,
      };
    },

    async rotateRefreshToken({ grantId, oldHash, newHash, expiresAt, now }) {
      const index = tokenIndex.get(oldHash);
      if (!index) return "unavailable";
      if (index.superseded) return "superseded";
      const grant = grants.get(grantId);
      if (!grant || grant.revoked) return "unavailable";
      tokenIndex.set(oldHash, { ...index, superseded: true });
      tokenIndex.set(newHash, { grantId, familyId: index.familyId, superseded: false });
      grants.set(grantId, { ...grant, refreshTokenHash: newHash, lastUsedAt: now, expiresAt });
      return "rotated";
    },

    async revokeGrantFamily(familyId) {
      revokeFamily(familyId);
    },
  };
}
