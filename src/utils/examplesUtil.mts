import { join as joinPosix } from "path/posix";
import Logger, { LoggerSource } from "../logger.mjs";
import { existsSync, readFileSync, rmSync } from "fs";
import { homedir } from "os";
import {
  getGit,
  sparseCheckout,
  sparseCloneRepository,
  execAsync,
} from "./gitUtil.mjs";
import Settings from "../settings.mjs";
import { checkForGit } from "./requirementsUtil.mjs";
import { cp } from "fs/promises";
import { get } from "https";
import { isInternetConnected, getDataRoot } from "./downloadHelpers.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";

const EXAMPLES_REPOSITORY_URL =
  "https://github.com/raspberrypi/pico-examples.git";
const EXAMPLES_JSON_URL =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/examples.json`;
const EXAMPLES_GITREF = "b6ac07f1946271de2817f94d8ffc0425ecb7c2a9";
const EXAMPLES_TAG = "sdk-2.1.0";

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
export async function loadExamples(): Promise<Example[]> {
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
        joinPosix(getDataRoot(), "examples.json")
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
  const requirementsCheck = await checkForGit(settings);
  if (!requirementsCheck) {
    return false;
  }

  const gitPath = await getGit(settings);

  if (existsSync(joinPosix(examplesRepoPath, ".git"))) {
    try {
      const ref = await execAsync(
        `cd ${
          process.env.ComSpec?.endsWith("cmd.exe") ? "/d " : " "
        }"${examplesRepoPath}" && ${
          process.env.ComSpec === "powershell.exe" ? "&" : ""
        }"${gitPath}" rev-parse HEAD`
      );
      Logger.log(`Examples git ref is ${ref.stdout}\n`);
      if (ref.stdout.trim() !== EXAMPLES_GITREF) {
        Logger.log(`Removing old examples repo\n`);
        rmSync(examplesRepoPath, { recursive: true, force: true });
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Corrupted examples directory
      Logger.log(`Removing corrupted examples repo\n`);
      rmSync(examplesRepoPath, { recursive: true, force: true });
    }
  } else if (existsSync(examplesRepoPath)) {
    // Examples path exists, but does not contain a git repository
    Logger.log(`Removing empty examples repo\n`);
    rmSync(examplesRepoPath, { recursive: true, force: true });
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

  Logger.log(`Sparse-checkout selected example: ${example.name}`);
  const result = await sparseCheckout(examplesRepoPath, example.path, gitPath);
  if (!result) {
    return result;
  }

  for (const libPath of example.libPaths) {
    Logger.log(`Sparse-checkout selected example required path: ${libPath}`);
    const result = await sparseCheckout(examplesRepoPath, libPath, gitPath);
    if (!result) {
      return result;
    }
  }

  Logger.log(`Copying example from ${absoluteExamplePath} to ${targetPath}`);
  // TODO: use example.name or example.search key for project folder name?
  await cp(absoluteExamplePath, joinPosix(targetPath, example.searchKey), {
    recursive: true,
  });

  for (let i = 0; i < example.libPaths.length; i++) {
    const libPath = example.libPaths[i];
    const libName = example.libNames[i];
    const absoluteLibPath = joinPosix(examplesRepoPath, libPath);
    Logger.log(
      `Copying example required path from ${absoluteLibPath} ` +
        `to ${targetPath}/${example.searchKey}/${libName}`
    );
    // TODO: use example.name or example.search key for project folder name?
    await cp(
      absoluteLibPath,
      joinPosix(targetPath, example.searchKey, libName),
      { recursive: true }
    );
  }

  Logger.log("Done copying example.");

  return result;
}
