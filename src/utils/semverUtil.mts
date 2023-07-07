/**
 * Function used to determine the order of the elements.
 * It is expected to return
 * - a negative value if the first argument is less than the second argument,
 * - zero if they're equal,
 * - and a positive value otherwise.
 * If omitted, the elements are sorted in ascending, ASCII character order.
 *
 * @param a
 * @param b
 * @returns
 */
export function compare(a: string, b: string): number {
  // check format
  if (!/^\d+(\.\d+)*$/.test(a) || !/^\d+(\.\d+)*$/.test(b)) {
    //throw new Error("Invalid version format");
    //return null;
    return 0;
  }

  const aParts = a.split(".");
  const bParts = b.split(".");

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = parseInt(aParts[i] || "0");
    const bPart = parseInt(bParts[i] || "0");

    if (aPart > bPart) {
      return 1;
    } else if (aPart < bPart) {
      return -1;
    }
  }

  return 0;
}
