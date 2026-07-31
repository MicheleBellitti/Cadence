/**
 * Per-uid token bucket for the /mcp endpoint.
 *
 * Deliberately in-memory and per-instance: the connector runs with a small
 * maxInstances and a cold start resetting a counter is harmless for a personal
 * read-only connector. Anything stronger would mean a Firestore write per tool
 * call. The SDK already rate-limits the OAuth endpoints separately.
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const BUCKET_CAPACITY = 60;
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000; // full bucket per minute
const MAX_TRACKED_UIDS = 1000;

const buckets = new Map<string, Bucket>();

export function allowRequest(uid: string, now = Date.now()): boolean {
  let bucket = buckets.get(uid);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_UIDS) {
      buckets.clear(); // bounded memory; worst case everyone gets a fresh bucket
    }
    bucket = { tokens: BUCKET_CAPACITY, lastRefill: now };
    buckets.set(uid, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
    bucket.lastRefill = now;
  }

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** Test seam. */
export function resetRateLimiter(): void {
  buckets.clear();
}
