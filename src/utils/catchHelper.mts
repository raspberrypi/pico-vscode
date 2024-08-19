export function unknownToError(unknown: unknown): Error {
  if (unknown instanceof Error) {
    return unknown;
  } else if (typeof unknown === "string") {
    return new Error(unknown);
  } else if (typeof unknown === "number") {
    return new Error(unknown.toString());
  } else {
    return new Error("Unknown error");
  }
}
