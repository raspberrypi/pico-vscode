import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default async function checkSwiftRequirements(): Promise<boolean> {
  return true;
  // check if swift is installed
  try {
    await execAsync("swift --version");

    // TODO: check swift version

    return true;
  } catch (error) {
    return false;
  }
}
