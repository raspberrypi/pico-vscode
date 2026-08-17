import { join as joinPosix } from "path/posix";
import Logger, { LoggerSource } from "../logger.mjs";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "fs";
import { homedir } from "os";
import {
  ensureGit,
  sparseCheckout,
  sparseCloneRepository,
  execAsync,
} from "./gitUtil.mjs";
import Settings from "../settings.mjs";
import { cp } from "fs/promises";
import { get } from "https";
import { isInternetConnected, getDataRoot } from "./downloadHelpers.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { type Uri, window } from "vscode";
import {
  EXAMPLES_GITREF,
  EXAMPLES_JSON_URL,
  EXAMPLES_REPOSITORY_URL,
  EXAMPLES_TAG,
} from "./sharedConstants.mjs";

export interface Example {
  path: string;
  name: string;
  libPaths: [string];
  libNames: [string];
  boards: [string];
  supportRiscV: boolean;
  searchKey: string;
}

interface ExamplesFile {
  [key: string]: {
    path: string;
    name: string;
    libPaths: [string];
    libNames: [string];
    boards: [string];
    supportRiscV: boolean;
  };
}

function buildExamplesPath(): string {
  return joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "examples");
}

/**
 * Recursively clears the read-only attribute on a file or directory tree.
 * Git for Windows marks some files as read-only, which causes fs.rmSync
 * to throw EPERM instead of deleting them, even with { force: true }.
 */
function clearReadOnlyRecursive(targetPath: string): void {
  let stat;
  try {
    stat = lstatSync(targetPath);
  } catch {
    return;
  }

  // Skip symlinks - do not follow them, and their target's permissions
  // are irrelevant to removing the link itself.
  if (stat.isSymbolicLink()) {
    return;
  }

  if (stat.isDirectory()) {
    try {
      for (const entry of readdirSync(targetPath)) {
        clearReadOnlyRecursive(joinPosix(targetPath, entry));
      }
    } catch {
      /* best effort */
    }
  }

  try {
    chmodSync(targetPath, stat.isDirectory() ? 0o777 : 0o666);
  } catch {
    /* best effort */
  }
}

/**
 * Removes the examples repository directory.
 *
 * @returns True if the directory does not exist anymore, false otherwise.
 */
function removeExamplesRepo(examplesRepoPath: string): boolean {
  clearReadOnlyRecursive(examplesRepoPath);
  try {
    rmSync(examplesRepoPath, { recursive: true, force: true });
  } catch (error) {
    Logger.warn(
      LoggerSource.examples,
      "Failed to remove examples repo.",
      unknownErrorToString(error)
    );
  }

  return !existsSync(examplesRepoPath);
}

function parseExamplesJson(data: string): Example[] {
  try {
    const examples = JSON.parse(data.toString()) as ExamplesFile;

    return Object.keys(examples).map(key => ({
      path: examples[key].path,
      name: examples[key].name,
      libPaths: examples[key].libPaths,
      libNames: examples[key].libNames,
      boards: examples[key].boards,
      supportRiscV: examples[key].supportRiscV,
      searchKey: key,
    }));
  } catch (error) {
    Logger.error(
      LoggerSource.examples,
      "Failed to parse examples.json.",
      unknownErrorToString(error)
    );

    return [];
  }
}

/**
 * Downloads the examples list from the internet or loads the included examples.json.
 *
 * @returns A promise that resolves with an array of Example objects.
 */
export async function loadExamples(extensionUri: Uri): Promise<Example[]> {
  try {
    if (!(await isInternetConnected())) {
      throw new Error(
        "Error while downloading examples list. " + "No internet connection"
      );
    }
    const result = await new Promise<Example[]>((resolve, reject) => {
      // Download the INI file
      get(EXAMPLES_JSON_URL, response => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              "Error while downloading examples list. " +
                `Status code: ${response.statusCode}`
            )
          );
        }
        let data = "";

        // Append data as it arrives
        response.on("data", chunk => {
          data += chunk;
        });

        // Parse the INI data when the download is complete
        response.on("end", () => {
          // Resolve with the array of SupportedToolchainVersion
          resolve(parseExamplesJson(data));
        });

        // Handle errors
        response.on("error", error => {
          reject(error);
        });
      });
    });

    Logger.info(
      LoggerSource.examples,
      "Successfully downloaded examples list from the internet."
    );

    return result;
  } catch (error) {
    Logger.warn(
      LoggerSource.examples,
      "Failed to download examples:",
      unknownErrorToString(error)
    );

    try {
      const examplesFile = readFileSync(
        joinPosix(getDataRoot(extensionUri), "examples.json")
      );

      return parseExamplesJson(examplesFile.toString("utf-8"));
    } catch (error) {
      Logger.error(
        LoggerSource.examples,
        "Failed to load included examples.json.",
        unknownErrorToString(error)
      );

      return [];
    }
  }
}

function parseBTStackSources(exampleDir: string): string[] {
  const cmakeListsPath = joinPosix(exampleDir, "CMakeLists.txt");
  if (!existsSync(cmakeListsPath)) {
    return [];
  }

  const content = readFileSync(cmakeListsPath, "utf-8");
  const match = content.match(/add_executable\s*\(([^)]+)\)/s);
  if (!match) {
    return [];
  }

  return match[1]
    .split("\n")
    .map(line => line.split("#")[0].trim())
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(1) // skip target name
    .filter(
      src => src.startsWith("..") || src.includes("${PICO_BTSTACK_PATH}")
    );
}

export async function setupExample(
  example: Example,
  targetPath: string
): Promise<boolean> {
  const examplesRepoPath = buildExamplesPath();
  const absoluteExamplePath = joinPosix(examplesRepoPath, example.path);

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

    return false;
  }

  // TODO: this does take about 2s - may be reduced
  const gitPath = await ensureGit(settings, { returnPath: true });
  if (
    gitPath === undefined ||
    typeof gitPath !== "string" ||
    gitPath.length === 0
  ) {
    Logger.log("Error: Git not found.");

    return false;
  }

  if (existsSync(joinPosix(examplesRepoPath, ".git"))) {
    let needsRemoval: boolean;
    try {
      const ref = await execAsync(
        `cd ${
          process.env.ComSpec?.endsWith("cmd.exe") ? "/d " : " "
        }"${examplesRepoPath}" && ${
          process.env.ComSpec === "powershell.exe" ? "&" : ""
        }"${gitPath}" rev-parse HEAD`
      );
      Logger.debug(
        LoggerSource.examples,
        `Examples git ref is ${ref.stdout}\n`
      );
      needsRemoval = ref.stdout.trim() !== EXAMPLES_GITREF;
    } catch (error) {
      // Corrupted examples directory
      Logger.debug(
        LoggerSource.examples,
        "Failed to read examples git ref, treating repo as corrupted.",
        unknownErrorToString(error)
      );
      needsRemoval = true;
    }

    if (needsRemoval) {
      Logger.debug(LoggerSource.examples, `Removing old examples repo\n`);
      if (!removeExamplesRepo(examplesRepoPath)) {
        Logger.error(
          LoggerSource.examples,
          `Failed to remove outdated/corrupted examples repo at ` +
            `${examplesRepoPath}.`
        );
        void window.showErrorMessage(
          "Failed to update the examples repository - it may be in use " +
            `by another process. Please close any programs that might be ` +
            `using files in ${examplesRepoPath} and try again, or delete ` +
            "this folder manually."
        );

        return false;
      }
    }
  } else if (existsSync(examplesRepoPath)) {
    // Examples path exists, but does not contain a git repository
    Logger.debug(LoggerSource.examples, `Removing empty examples repo\n`);
    if (!removeExamplesRepo(examplesRepoPath)) {
      Logger.error(
        LoggerSource.examples,
        `Failed to remove invalid examples repo at ${examplesRepoPath}.`
      );
      void window.showErrorMessage(
        `Failed to prepare the examples repository. Please delete ` +
          `${examplesRepoPath} and try again.`
      );

      return false;
    }
  }

  if (!existsSync(examplesRepoPath)) {
    const result = await sparseCloneRepository(
      EXAMPLES_REPOSITORY_URL,
      EXAMPLES_TAG,
      examplesRepoPath,
      gitPath
    );

    if (!result) {
      return result;
    }
  }

  Logger.debug(
    LoggerSource.examples,
    `Sparse-checkout selected example: ${example.name}`
  );
  const result = await sparseCheckout(examplesRepoPath, example.path, gitPath);
  if (!result) {
    Logger.error(
      LoggerSource.examples,
      `Failed to checkout example '${example.name}':`,
      unknownErrorToString(result)
    );
    void window.showErrorMessage(
      `Failed to checkout example: ${example.name}. ` +
        `Please delete ${examplesRepoPath} and try again.`
    );

    return result;
  }

  for (const libPath of example.libPaths) {
    Logger.debug(
      LoggerSource.examples,
      `Sparse-checkout selected example required path: ${libPath}`
    );
    const result = await sparseCheckout(examplesRepoPath, libPath, gitPath);
    if (!result) {
      Logger.error(
        LoggerSource.examples,
        `Failed to checkout example required path '${libPath}':`,
        unknownErrorToString(result)
      );
      void window.showErrorMessage(
        `Failed to checkout example required path '${libPath}'. ` +
          `Please delete ${examplesRepoPath} and try again.`
      );

      return result;
    }
  }

  const isBTStackExample = example.path.includes("btstack_examples");
  const extraRepoFiles: string[] = [];

  if (isBTStackExample) {
    for (const src of parseBTStackSources(absoluteExamplePath)) {
      if (!src.startsWith("..")) {
        continue;
      } else {
        // joinPosix normalises the ../ components
        const repoRelative = joinPosix(example.path, src);
        extraRepoFiles.push(repoRelative);
        Logger.debug(
          LoggerSource.examples,
          `Sparse-checkout BTStack extra file: ${repoRelative}`
        );
        const extraResult = await sparseCheckout(
          examplesRepoPath,
          repoRelative,
          gitPath
        );
        if (!extraResult) {
          Logger.warn(
            LoggerSource.examples,
            `Failed to checkout BTStack extra file: ${repoRelative}`
          );
        }
      }
    }
  }

  Logger.debug(
    LoggerSource.examples,
    `Copying example from ${absoluteExamplePath} to ${targetPath}`
  );
  // TODO: use example.name or example.search key for project folder name?
  try {
    await cp(absoluteExamplePath, joinPosix(targetPath, example.searchKey), {
      recursive: true,
    });
  } catch (error) {
    const msg = unknownErrorToString(error);
    if (
      msg.includes("EACCESS") ||
      msg.includes("EPERM") ||
      msg.includes("access denied")
    ) {
      Logger.error(
        LoggerSource.examples,
        "Failed to copy example. " +
          "Please check if the target path is writable.",
        msg
      );
      void window.showErrorMessage(
        "Failed to copy example. " +
          "Please check if the target path is writable."
      );
    } else {
      Logger.error(LoggerSource.examples, "Failed to copy example.", msg);
      void window.showErrorMessage(
        "Failed to copy example. " +
          "Please check the output window for more details."
      );
    }

    return false;
  }

  for (let i = 0; i < example.libPaths.length; i++) {
    const libPath = example.libPaths[i];
    const libName = example.libNames[i];
    const absoluteLibPath = joinPosix(examplesRepoPath, libPath);
    Logger.debug(
      LoggerSource.examples,
      `Copying example required path from ${absoluteLibPath} ` +
        `to ${targetPath}/${example.searchKey}/${libName}`
    );
    // TODO: use example.name or example.search key for project folder name?
    try {
      await cp(
        absoluteLibPath,
        joinPosix(targetPath, example.searchKey, libName),
        { recursive: true }
      );
    } catch (error) {
      Logger.error(
        LoggerSource.examples,
        `Failed to copy example requirement '${libName}':`,
        unknownErrorToString(error)
      );
      void window.showErrorMessage(
        `Failed to copy example requirement '${libName}'. ` +
          "Please check the output window for more details."
      );

      return false;
    }
  }

  if (isBTStackExample) {
    const exampleTargetPath = joinPosix(targetPath, example.searchKey);

    for (const repoRelative of extraRepoFiles) {
      const filename = repoRelative.split("/").pop()!;
      Logger.debug(
        LoggerSource.examples,
        `Copying BTStack repo file ${repoRelative} ` +
        `to ${exampleTargetPath}/${filename}`
      );
      try {
        await cp(
          joinPosix(examplesRepoPath, repoRelative),
          joinPosix(exampleTargetPath, filename)
        );
      } catch (error) {
        Logger.warn(
          LoggerSource.examples,
          `Failed to copy BTStack repo file '${filename}':`,
          unknownErrorToString(error)
        );
      }
    }

  }

  Logger.info(LoggerSource.examples, "Done copying example.");

  return result;
}

function parseBTStackGattFiles(exampleDir: string): string[] {
  const cmakeListsPath = joinPosix(exampleDir, "CMakeLists.txt");
  if (!existsSync(cmakeListsPath)) {
    return [];
  }

  const content = readFileSync(cmakeListsPath, "utf-8");
  const results: string[] = [];
  const gattRegex = /pico_btstack_make_gatt_header\s*\(([^)]+)\)/gs;
  let match;

  while ((match = gattRegex.exec(content)) !== null) {
    match[1]
      .split("\n")
      .map(line => line.split("#")[0].trim())
      .join(" ")
      .split(/\s+/)
      .filter(token => token.includes("${PICO_BTSTACK_PATH}"))
      .forEach(token => results.push(token));
  }

  return results;
}

export async function copyBTStackSDKSources(
  exampleTargetPath: string,
  sdkPath: string
): Promise<void> {
  const btStackPath = joinPosix(
    sdkPath.replaceAll("\\", "/"), "lib", "btstack"
  );

  const sdkSrcs = [
    ...parseBTStackSources(exampleTargetPath).filter(src =>
      src.includes("${PICO_BTSTACK_PATH}")
    ),
    ...parseBTStackGattFiles(exampleTargetPath),
  ];

  for (const src of sdkSrcs) {
    const sdkFile = src.replace("${PICO_BTSTACK_PATH}/", "");
    const filename = sdkFile.split("/").pop()!;
    const srcPath = joinPosix(btStackPath, sdkFile);
    Logger.debug(
      LoggerSource.examples,
      `Copying BTStack SDK file ${srcPath} to ${exampleTargetPath}/${filename}`
    );
    try {
      await cp(srcPath, joinPosix(exampleTargetPath, filename));
    } catch (error) {
      Logger.warn(
        LoggerSource.examples,
        `Failed to copy BTStack SDK file '${filename}':`,
        unknownErrorToString(error)
      );
    }
  }
}
