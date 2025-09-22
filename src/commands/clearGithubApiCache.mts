import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import GithubApiCache from "../utils/githubApiCache.mjs";
import { window } from "vscode";
import { CLEAR_GITHUB_API_CACHE } from "./cmdIds.mjs";

export default class ClearGithubApiCacheCommand extends Command {
  private _logger: Logger = new Logger("ClearGithubApiCacheCommand");

  constructor() {
    super(CLEAR_GITHUB_API_CACHE);
  }

  async execute(): Promise<void> {
    this._logger.info("Clearing Github API cache...");

    await GithubApiCache.getInstance().clear();

    await window.showInformationMessage("Github API cache cleared.");
  }
}
