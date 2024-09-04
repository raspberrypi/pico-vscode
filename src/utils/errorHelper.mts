/**
 * Convert an unknown typed error to a string.
 *
 * @param err - The error to convert.
 * @returns The error as an appropriate string.
 */
export function unknownErrorToString(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  } else if (typeof err === "string") {
    return err;
  } else if (typeof err === "number" || typeof err === "boolean") {
    return err.toString();
  } else if (typeof err === "object") {
    return JSON.stringify(err);
  } else if (typeof err === "undefined") {
    return "Undefined error";
  } else {
    return "Unknown error";
  }
}

/**
 * Convert an unknown typed error to an Error object.
 *
 * @param unknown The unknown typed error to convert.
 * @returns The error as an Error object.
 */
export function unknownToError(unknown: unknown): Error {
  if (unknown instanceof Error) {
    return unknown;
  } else if (typeof unknown === "string") {
    return new Error(unknown);
  } else if (typeof unknown === "number" || typeof unknown === "boolean") {
    return new Error(unknown.toString());
  } else if (typeof unknown === "object") {
    return new Error(JSON.stringify(unknown));
  } else if (typeof unknown === "undefined") {
    return new Error("Undefined error");
  } else {
    return new Error("Unknown error");
  }
}
