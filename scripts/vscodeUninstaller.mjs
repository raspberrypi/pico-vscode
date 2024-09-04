import { homedir } from "os";
import { join } from "path";
import { rimraf } from "rimraf";

const picoSdkRoot = join(homedir(), ".pico-sdk");

rimraf(picoSdkRoot, (err) => {
  if (err) {
    console.error(err);
  } else {
    console.log(`Successfully uninstalled Pico SDK and it's dependencies from ${picoSdkRoot}.`);
  }
}, { glob: false });
