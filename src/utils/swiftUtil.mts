import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default async function checkSwiftRequirements(): Promise<boolean> {
  try {
    const result = await execAsync("swift --version");

    if (!result.stdout.includes("-dev")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
