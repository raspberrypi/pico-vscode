import { homedir } from "os";
import { join } from "path";
import { rimraf } from "rimraf";

const picoSdkRoot = join(homedir(), ".pico-sdk");

rimraf(picoSdkRoot, { glob: false }).then(() => {
  console.log("Pico SDK has been uninstalled successfully.");
}).catch((err) => {
  console.error("Error occurred while uninstalling Pico SDK:", err);
});
