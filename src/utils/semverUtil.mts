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

export type Pre = { tag: "alpha" | "beta" | "rc" | null; num: number };

export type ParsedVer = {
  major: number;
  minor: number;
  patch: number;
  pre: Pre; // null tag means "final"
};

function parseVer(input: string): ParsedVer | null {
  const s = input.trim().toLowerCase().replace(/^v/, "");
  const [core, preRaw = ""] = s.split("-", 2);

  // allow 2 or 3 core parts; pad missing with 0
  const parts = core.split(".").map(n => Number(n));
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const [major, minor, patch = 0] = parts;
  if (![major, minor, patch].every(n => Number.isInteger(n) && n >= 0)) {
    return null;
  }

  let pre: Pre = { tag: null, num: 0 };
  if (preRaw) {
    // accept alpha/beta/rc with optional number (default 0)
    const m = /^(alpha|beta|rc)(\d+)?$/.exec(preRaw);
    if (!m) {
      return null;
    }
    pre = { tag: m[1] as Pre["tag"], num: m[2] ? Number(m[2]) : 0 };
  }

  return { major, minor, patch, pre };
}

const rank: Record<NonNullable<Pre["tag"]> | "final", number> = {
  alpha: 0,
  beta: 1,
  rc: 2,
  final: 3,
};

/** Compare a vs b: -1 if a<b, 0 if equal, 1 if a>b */
export function compareSemverPre(a: string, b: string): number {
  const A = parseVer(a),
    B = parseVer(b);
  if (!A || !B) {
    throw new Error(`Invalid version: "${a}" or "${b}"`);
  }

  if (A.major !== B.major) {
    return A.major < B.major ? -1 : 1;
  }
  if (A.minor !== B.minor) {
    return A.minor < B.minor ? -1 : 1;
  }
  if (A.patch !== B.patch) {
    return A.patch < B.patch ? -1 : 1;
  }

  // prerelease ranking: alpha < beta < rc < final
  const rA = rank[A.pre.tag ?? "final"];
  const rB = rank[B.pre.tag ?? "final"];
  if (rA !== rB) {
    return rA < rB ? -1 : 1;
  }

  // same prerelease tag (or both final)
  if (A.pre.tag === null) {
    return 0;
  } // both final
  if (A.pre.num !== B.pre.num) {
    return A.pre.num < B.pre.num ? -1 : 1;
  }

  return 0;
}

export const geSemverPre = (a: string, b: string): boolean =>
  compareSemverPre(a, b) >= 0;
export const ltSemverPre = (a: string, b: string): boolean =>
  compareSemverPre(a, b) < 0;
