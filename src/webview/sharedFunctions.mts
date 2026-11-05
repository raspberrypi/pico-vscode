import {
  l10n,
  type OpenDialogOptions,
  Uri,
  type WebviewOptions,
} from "vscode";

export function getWebviewOptions(extensionUri: Uri): WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [Uri.joinPath(extensionUri, "web")],
  };
}

export function getProjectFolderDialogOptions(
  projectRoot?: Uri,
  forImport: boolean = false
): OpenDialogOptions {
  return {
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: l10n.t("Select"),
    title: forImport
      ? l10n.t("Select a project folder to import")
      : l10n.t("Select a project root to create the new project folder in"),
    defaultUri: projectRoot,
  };
}

/**
 * Returns an inline script defining a global `l10n.t` for the webview
 * scripts in web/, backed by the extension's current l10n bundle.
 *
 * Keeps the same call shape as `vscode.l10n.t` so scripts/l10n.mjs can
 * extract the strings. Must be included before any script that uses it.
 */
export function getL10nScript(nonce: string): string {
  // Escape "<" so a translation can't close the script tag
  const bundle = JSON.stringify(l10n.bundle ?? {}).replaceAll("<", "\\u003c");

  return `<script nonce="${nonce}">
    window.l10n = (() => {
      const bundle = ${bundle};
      const format = (template, args) =>
        template.replace(/{([^}]+)}/g, (match, key) =>
          Object.prototype.hasOwnProperty.call(args, key)
            ? String(args[key])
            : match
        );
      return {
        t(message, ...args) {
          let key = message;
          if (typeof message === "object") {
            const comment = message.comment;
            key = comment && comment.length > 0
              ? message.message + "/" +
                (Array.isArray(comment) ? comment.join("") : comment)
              : message.message;
            args = message.args === undefined ? [] : [message.args];
            message = message.message;
          }
          const entry = bundle[key];
          const template =
            typeof entry === "string" ? entry : entry?.message ?? message;
          const values =
            args.length === 1 && typeof args[0] === "object" && args[0] !== null
              ? args[0]
              : args;
          return format(template, values);
        },
      };
    })();
  </script>`;
}

export function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}
