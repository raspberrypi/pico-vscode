import { join as joinPosix } from "path/posix";
import Logger from "../logger.mjs";
import { existsSync, readFileSync, rmSync } from "fs";
import { homedir } from "os";
import {
  getGit,
  sparseCheckout,
  sparseCloneRepository,
  execAsync,
} from "./gitUtil.mjs";
import Settings from "../settings.mjs";
import { checkForInstallationRequirements } from "./requirementsUtil.mjs";
import { cp } from "fs/promises";
import { get } from "https";
import {
  isInternetConnected,
  CURRENT_DATA_VERSION,
  getDataRoot,
} from "./downloadHelpers.mjs";

const EXAMPLES_REPOSITORY_URL =
  "https://github.com/raspberrypi/pico-examples.git";
const EXAMPLES_JSON_URL =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/examples.json`;
const EXAMPLES_GITREF = "7fe60d6b4027771e45d97f207532c41b1d8c5418";
const EXAMPLES_TAG = "sdk-2.0.0";

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
  } catch {
    Logger.log("Failed to parse examples.json");

    return [];
  }
}

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

    // TODO: Logger.debug
    Logger.log(`Successfully downloaded examples list from the internet.`);

    return result;
  } catch (error) {
    Logger.log(error instanceof Error ? error.message : (error as string));

    try {
      const examplesFile = readFileSync(
        joinPosix(getDataRoot(), "examples.json")
      );

      return parseExamplesJson(examplesFile.toString("utf-8"));
    } catch {
      Logger.log("Failed to load examples.json");

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
  const requirementsCheck = await checkForInstallationRequirements(settings);
  if (!requirementsCheck) {
    return false;
  }

  const gitPath = await getGit(settings);

  if (existsSync(joinPosix(examplesRepoPath, ".git"))) {
    const ref = await execAsync(
      `cd "${examplesRepoPath}" && ${
        process.env.ComSpec === "powershell.exe" ? "&" : ""
      }"${gitPath}" rev-parse HEAD`
    );
    Logger.log(`Examples git ref is ${ref.stdout}\n`);
    if (ref.stdout.trim() !== EXAMPLES_GITREF) {
      Logger.log(`Removing old examples repo\n`);
      rmSync(examplesRepoPath, { recursive: true, force: true });
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

  for (let i=0; i < example.libPaths.length; i++) {
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
      joinPosix(targetPath, example.searchKey, libName
    ), {recursive: true});
  }

  Logger.log("Done copying example.");

  return result;
}
