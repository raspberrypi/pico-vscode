import { assert } from "console";
import { writeFile } from "fs/promises";

// TODO: maybe not needed

export class TomlInlineObject<T extends Record<string, any>> {
  constructor(public values: T) {}
  public toString(): string {
    return `{ ${Object.entries(this.values)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key} = ${tomlArrayToInlineString(value)}`;
        }

        assert(
          typeof value !== "object",
          "TomlInlineObject Value must not be an object."
        );

        return `${key} = ${typeof value === "string" ? `"${value}"` : value}`;
      })
      .join(", ")} }`;
  }
}

function tomlArrayToInlineString<T>(value: T[]): string {
  return `[${value
    .map(v => (typeof v === "string" ? `"${v}"` : (v as number | boolean)))
    .join(", ")}]`;
}

function tomlObjectToString<T>(
  value: object | Record<string, T>,
  parent = ""
): string {
  return (
    Object.entries(value)
      .filter(([, value]) => value !== null && value !== undefined)
      // sort entries by type of value (object type last)
      .sort(([, value1], [, value2]) =>
        typeof value1 === "object" ? 1 : typeof value2 === "object" ? -1 : 0
      )
      .reduce((acc, [key, value]) => {
        if (value instanceof TomlInlineObject) {
          acc += `${key} = ${value.toString()}\n`;
        } else if (Array.isArray(value)) {
          acc += `${key} = ${tomlArrayToInlineString(value)}\n`;
        } else if (typeof value === "object") {
          // check if every subkeys value is of type object
          if (
            Object.entries(value as object).every(
              ([, value]) =>
                !(value instanceof TomlInlineObject) &&
                typeof value === "object" &&
                !Array.isArray(value)
            )
          ) {
            acc += tomlObjectToString(value as object, parent + key + ".");

            return acc;
          }

          acc += `${acc.length > 0 ? "\n" : ""}[${parent + key}]\n`;
          acc += tomlObjectToString(value as object, parent + key + ".");
        } else {
          acc += `${key} = ${
            typeof value === "string" ? `"${value}"` : value
          }\n`;
        }

        return acc;
      }, "")
  );
}

/**
 * Writes a toml object to a file.
 *
 * Please note there are special types for
 * writing an object as inline object or writing a dictionary.
 *
 * @param filePath The path to the file.
 * @param toml The toml object.
 * @returns A promise that resolves when the file was written.
 */
export async function writeTomlFile(
  filePath: string,
  toml: object
): Promise<void> {
  const tomlString = tomlObjectToString(toml);

  // write to file
  return writeFile(filePath, tomlString);
}
