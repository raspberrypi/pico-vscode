/**
 * Sets the PICO_SDK_PATH environment variable for vscode
 * but also preserves the systems PICO_SDK_PATH variable if set.
 *
 * @param path New PICO_SDK_PATH
 */
export function setPicoSDKPath(path: string): void {
  if (process.env.PICO_SDK_PATH) {
    process.env.OLD_PICO_SDK_PATH = process.env.PICO_SDK_PATH;
  }
  process.env.PICO_SDK_PATH = path;
}

export function setToolchainPath(path: string): void {
  process.env.PICO_TOOLCHAIN_PATH = path;
  if (process.platform === "win32") {
    process.env.Path = `${path};${process.env.Path ?? ""}`;
  } else {
    process.env.PATH = `${path};${process.env.PATH ?? ""}`;
  }
}

/**
 * Retrieves the PICO_SDK_PATH environment variable from outside vscode.
 * Usefull for detecting the pico-sdk set by the user outside of vscode by env variable.
 *
 * @returns PICO_SDK_PATH environment variable unmatched by the extension
 */
export function getSystemPicoSDKPath(): string | undefined {
  // if there was PICO_SDK_PATH set outside of vscode, use it
  return process.env.OLD_PICO_SDK_PATH || undefined;
}
