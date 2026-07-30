/** Current wall-clock time as epoch seconds — the unit every OAuth record uses. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
