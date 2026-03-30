/**
 * Business day arithmetic utilities.
 *
 * All functions operate on calendar dates, ignoring time-of-day.
 * Dates constructed from ISO strings (e.g. `new Date("2026-03-30")`) are
 * treated as UTC-midnight values, so we use UTC accessors throughout to
 * avoid local-timezone shifts.
 */

/** Number of milliseconds in one day */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Return a new Date at UTC midnight for the given date's calendar day. */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/** Add `n` calendar days to `date` (UTC-safe). */
function addDaysUTC(date: Date, n: number): Date {
  return new Date(date.getTime() + n * ONE_DAY_MS);
}

/**
 * Returns true if the given date is a business day (Monday–Friday).
 * Uses UTC day-of-week so ISO string dates aren't shifted.
 */
export function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Advances `date` to the next business day if it falls on a weekend.
 * Returns the date unchanged if it is already a business day.
 * Works at UTC midnight.
 */
function toNextBusinessDay(date: Date): Date {
  let d = utcMidnight(date);
  while (!isBusinessDay(d)) {
    d = addDaysUTC(d, 1);
  }
  return d;
}

/**
 * Returns the end date for a task that starts on `date` and lasts `n` business days.
 *
 * Semantics:
 *   - A 1-day task occupies only its start day → returns the start day.
 *   - A 2-day task occupies start + next business day → returns start + 1 business day.
 *   - Formula: advance (n - 1) business days from the (adjusted) start date.
 *   - For n <= 0, returns the (adjusted) start date.
 *   - If `date` is a weekend it is first advanced to the next Monday.
 */
export function addBusinessDays(date: Date, n: number): Date {
  let current = toNextBusinessDay(date);

  if (n <= 1) {
    return current;
  }

  let remaining = n - 1;
  while (remaining > 0) {
    current = addDaysUTC(current, 1);
    if (isBusinessDay(current)) {
      remaining--;
    }
  }

  return current;
}

/**
 * Counts business days from `a` to `b`, exclusive of `a` and inclusive of `b`.
 * Equivalently: the number of business days you traverse going from `a` to `b`.
 *
 * Returns 0 when `a` equals or is after `b`.
 */
export function businessDaysBetween(a: Date, b: Date): number {
  const start = utcMidnight(a);
  const end = utcMidnight(b);

  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  let count = 0;
  let current = addDaysUTC(start, 1);

  while (current.getTime() <= end.getTime()) {
    if (isBusinessDay(current)) {
      count++;
    }
    current = addDaysUTC(current, 1);
  }

  return count;
}

/**
 * Formats a Date to a `YYYY-MM-DD` string using local calendar date.
 * This pairs correctly with `parseDate`, which returns a local-midnight Date.
 *
 * Note: when the input was constructed via `new Date("YYYY-MM-DD")` (UTC
 * midnight) the UTC and local calendar dates can differ in negative-offset
 * zones.  All internal Date values produced by this module are local-midnight
 * dates, so local accessors are correct here.
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a `YYYY-MM-DD` string into a Date at local midnight (hours === 0).
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}
