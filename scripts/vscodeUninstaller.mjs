import { homedir } from "os";
import { join } from "path";
import { rm } from "fs/promises";

const picoSdkRoot = join(homedir(), ".pico-sdk");

try {
  await rm(picoSdkRoot, { recursive: true, force: true });
  console.log("Pico SDK has been uninstalled successfully.");
} catch (err) {
  console.error("Error occurred while uninstalling Pico SDK:", err);
}
