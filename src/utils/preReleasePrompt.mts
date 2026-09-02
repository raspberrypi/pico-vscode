import { commands, window, type ExtensionContext } from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { PRE_RELEASE_PROMPT_URL } from "./sharedConstants.mjs";

const EXTENSION_ID = "raspberry-pi.raspberry-pi-pico";
const HANDLED_STATE_KEY = "preReleasePromptHandledFor";
const MARKETPLACE_QUERY_URL =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
// IncludeVersions | IncludeVersionProperties | IncludeLatestVersionOnly
const MARKETPLACE_FLAGS = 529;
const PRE_RELEASE_PROPERTY = "Microsoft.VisualStudio.Code.PreRelease";
const REQUEST_TIMEOUT_MS = 5000;

// No API for this, so go by the version: releases are x.y.0, pre-releases are
// later patches of the same minor
export function isPreReleaseVersion(version: string): boolean {
  const patch = parseInt(version.split(".")[2] ?? "", 10);

  return !isNaN(patch) && patch > 0;
}

async function fetchPromptSince(): Promise<number | undefined> {
  const response = await fetch(PRE_RELEASE_PROMPT_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as { promptSince?: string | null };
  // YYYY-MM-DD only - Date.parse would also take formats that mean different
  // days in different locales
  if (
    typeof data.promptSince !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.promptSince)
  ) {
    return undefined;
  }

  const promptSince = Date.parse(data.promptSince);

  return isNaN(promptSince) ? undefined : promptSince;
}

async function preReleaseAvailable(): Promise<boolean> {
  const response = await fetch(MARKETPLACE_QUERY_URL, {
    method: "POST",
    /* eslint-disable @typescript-eslint/naming-convention */
    headers: {
      Accept: "application/json; api-version=3.0-preview",
      "Content-Type": "application/json",
      "User-Agent": "vscode-raspberry-pi-pico",
    },
    /* eslint-enable @typescript-eslint/naming-convention */
    body: JSON.stringify({
      filters: [{ criteria: [{ filterType: 7, value: EXTENSION_ID }] }],
      flags: MARKETPLACE_FLAGS,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    Logger.debug(
      LoggerSource.preReleasePrompt,
      `Marketplace query returned ${response.status}.`
    );

    return false;
  }

  const data = (await response.json()) as {
    results?: Array<{
      extensions?: Array<{
        versions?: Array<{ properties?: Array<Record<string, string>> }>;
      }>;
    }>;
  };

  // the marketplace ranks a pre-release above the release it supersedes, so the
  // latest version carrying the property means there is one to switch to
  const latest = data.results?.[0]?.extensions?.[0]?.versions?.[0];

  return (
    latest?.properties?.some(p =>
      Object.values(p).includes(PRE_RELEASE_PROPERTY)
    ) ?? false
  );
}

export async function promptForPreRelease(
  context: ExtensionContext
): Promise<void> {
  try {
    const version = (context.extension.packageJSON as { version?: string })
      .version;
    if (version === undefined || isPreReleaseVersion(version)) {
      return;
    }

    // anything unreadable means no prompt, so a failed fetch never interrupts
    const promptSince = await fetchPromptSince();
    if (promptSince === undefined) {
      return;
    }

    const handled = context.globalState.get<number>(HANDLED_STATE_KEY);
    if (handled !== undefined && handled >= promptSince) {
      return;
    }

    if (!(await preReleaseAvailable())) {
      // leave them eligible for when one is published
      return;
    }

    // before asking, so a dismissed notification doesn't come back
    await context.globalState.update(HANDLED_STATE_KEY, promptSince);

    const switchTo = "Switch to Pre-Release";
    const selection = await window.showInformationMessage(
      "A pre-release version of the Raspberry Pi Pico extension is " +
        "available, would you like to switch to it?",
      switchTo,
      "No Thanks"
    );

    if (selection === switchTo) {
      await commands.executeCommand(
        "workbench.extensions.installExtension",
        EXTENSION_ID,
        { installPreReleaseVersion: true }
      );
    }
  } catch (error) {
    Logger.debug(
      LoggerSource.preReleasePrompt,
      `Pre-release check skipped: ${unknownErrorToString(error)}`
    );
  }
}
