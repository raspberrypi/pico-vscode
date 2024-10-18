import Logger from "../logger.mjs";
import { CommandWithResult } from "./command.mjs";
import { Uri } from "vscode";

export default class GetRTTDecoderPathCommand extends CommandWithResult<string> {
  private readonly _logger = new Logger("GetRTTDecoderPathCommand");

  public static readonly id = "getRTTDecoderPath";

  constructor(private readonly _extensionUri: Uri) {
    super(GetRTTDecoderPathCommand.id);
  }

  execute(): string {
    this._logger.debug("Retrieving RTT decoder path");

    return Uri.joinPath(this._extensionUri, "scripts", "rttDecoder.cjs").fsPath;
  }
}
