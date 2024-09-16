import { resolve } from "path";
import * as Mocha from "mocha";
import { globSync } from "glob";
import { unknownToError } from "../../utils/errorHelper.mjs";

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
  });

  const testsRoot = resolve(__dirname, "..");

  return new Promise((c, e) => {
    const files = globSync("**/**.test.js", { cwd: testsRoot });

    // Add files to the test suite
    files.forEach(f => mocha.addFile(resolve(testsRoot, f)));

    try {
      // Run the mocha test
      mocha.run(failures => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(unknownToError(err));
    }
  });
}
