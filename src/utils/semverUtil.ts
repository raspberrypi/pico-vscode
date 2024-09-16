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

/**
 * Function to compare two semantic version strings.
 * Returns true if the first version is greater than or equal to the second version.
 *
 * @param first - The first version string.
 * @param second - The second version string.
 * @returns boolean - True if the first version is greater than or equal to the second version.
 * Defaults to false if the version strings are invalid. (behaviour will be removed in
 * a future version)
 */
export function compareGe(first: string, second: string): boolean {
  // Split the version strings into parts and convert them to numbers
  const firstParts = first.split(".").map(Number);
  const secondParts = second.split(".").map(Number);

  // Ensure both versions have three parts
  if (firstParts.length !== 3 || secondParts.length !== 3) {
    // TODO: use proper error handling in switch SDK
    /*throw new Error(
      "Version strings must have exactly three parts (major.minor.patch)"
    );*/
    return false;
  }

  // Compare the version parts
  for (let i = 0; i < 3; i++) {
    if (firstParts[i] > secondParts[i]) {
      return true;
    } else if (firstParts[i] < secondParts[i]) {
      return false;
    }
  }

  // If all parts are equal
  return true;
}

/**
 * Function to compare two semantic version strings.
 * Returns true if the first version is less than the second version.
 *
 * @param first - The first version string.
 * @param second - The second version string.
 * @returns boolean - True if the first version is less than the second version.
 */
export function compareLt(first: string, second: string): boolean {
  // Split the version strings into parts and convert them to numbers
  const firstParts = first.split(".").map(Number);
  const secondParts = second.split(".").map(Number);

  // Ensure both versions have three parts
  if (firstParts.length !== 3 || secondParts.length !== 3) {
    throw new Error(
      "Version strings must have exactly three parts (major.minor.patch)"
    );
  }

  // Compare the version parts directly
  for (let i = 0; i < 3; i++) {
    if (firstParts[i] < secondParts[i]) {
      return true;
    } else if (firstParts[i] > secondParts[i]) {
      return false;
    }
  }

  // If all parts are equal, first is not less than second
  return false;
}

/**
 * Function to compare the major versions of two semantic version strings.
 * Returns true if the first version's major part is greater than or equal
 * to the second version's major part.
 *
 * @param first - The first version string.
 * @param second - The second version string.
 * @returns boolean - True if the first version's major part is greater than or
 * equal to the second version's major part.
 */
export function compareGeMajor(first: string, second: string): boolean {
  // Split the version strings into parts and convert them to numbers
  const firstMajor = parseInt(first.split(".")[0]);
  const secondMajor = parseInt(second.split(".")[0]);

  // Compare only the major versions
  return firstMajor >= secondMajor;
}

/**
 * Function to compare the major versions of two semantic version strings.
 * Returns true if the first version's major part is less than the second version's major part.
 *
 * @param first - The first version string.
 * @param second - The second version string.
 * @returns boolean - True if the first version's major part is less than the
 * second version's major part.
 */
export function compareLtMajor(first: string, second: string): boolean {
  // Split the version strings into parts and convert them to numbers
  const firstMajor = parseInt(first.split(".")[0]);
  const secondMajor = parseInt(second.split(".")[0]);

  // Compare only the major versions
  return firstMajor < secondMajor;
}
