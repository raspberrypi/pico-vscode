import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import GithubApiCache from "../utils/githubApiCache.mjs";
import { window, l10n } from "vscode";

export default class ClearGithubApiCacheCommand extends Command {
  private _logger: Logger = new Logger("ClearGithubApiCacheCommand");

  public static readonly id = "clearGithubApiCache";

  constructor() {
    super(ClearGithubApiCacheCommand.id);
  }

  async execute(): Promise<void> {
    this._logger.info("Clearing Github API cache...");

    await GithubApiCache.getInstance().clear();

    await window.showInformationMessage(l10n.t("Github API cache cleared."));
  }
}
