import { extensionName } from "./commands/command.mjs";

export enum ContextKeys {
  // General key to check if the current project is a pico project
  // that is supported by the extension (C/C++, Rust or Zpephyr)
  isPicoProject = `${extensionName}.isPicoProject`,
  // Key to check if the current project is a rust pico project
  isRustProject = `${extensionName}.isRustProject`,
  // Key to check if the current project is a zephyr pico project
  isZephyrProject = `${extensionName}.isZephyrProject`,
}
