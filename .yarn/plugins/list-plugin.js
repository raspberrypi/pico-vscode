const fs = require("fs");

// Setup: Place this file in `.yarn/plugins/list-plugin.js` and the following
// to `.yarnrc.yml`:
//
// ```
// plugins:
//  - path: .yarn/plugins/plugin-list.js
// ```
module.exports = {
  name: "plugin-list",
  factory: (require) => {
    const { BaseCommand } = require("@yarnpkg/cli");
    const { Command, Option } = require("clipanion");
    const { parseSyml } = require("@yarnpkg/parsers");

    class ListCommand extends BaseCommand {
      static paths = [["list"]];

      static usage = Command.Usage({
        description: "Lists installed packages.",
      });

      prod = Option.Boolean("--prod", false);
      json = Option.Boolean("--json", false);

      async execute() {
        if (!this.prod || !this.json) {
          throw new Error(
            "This command can only be used with the --prod and --json " +
              "args to match the behavior required by VSCE. See: " +
              "https://github.com/microsoft/vscode-vsce/blob/main/src/npm.ts",
          );
        }

        const packageJsonContents = fs.readFileSync("package.json", "utf-8");
        const { dependencies = {} } = JSON.parse(packageJsonContents);
 
        const lockContents = fs.readFileSync("yarn.lock", "utf-8");
        const resolved = parseSyml(lockContents);

        const trees = [];

        function addDependency(packageName, versionRange) {
          const packageInfo = lookup(
            resolved,
            getLockFileKey(packageName, versionRange),
          );
          if (!packageInfo) {
            throw new Error(
              `Cannot resolve "${packageName}" with version range "${versionRange}"`,
            );
          }

          const { version, dependencies } = packageInfo;
          const name = `${packageName}@${version}`;
          if (trees.find((tree) => tree.name === name)) {
            return; // Dependency already added as part of another tree.
          }

          if (dependencies) {
            const children = Object.entries(dependencies).map(
              ([name, range]) => ({ name: `${name}@${range}` }),
            );
            trees.push({ name, children });

            addDependencies(dependencies);
          } else {
            trees.push({ name, children: [] });
          }
        }

        function addDependencies(dependencies) {
          for (const [packageName, versionRange] of Object.entries(
            dependencies,
          )) {
            addDependency(packageName, versionRange);
          }
        }

        addDependencies(dependencies);

        const output = {
          type: "tree",
          data: { type: "list", trees },
        };

        this.context.stdout.write(JSON.stringify(output));
      }
    }

    return {
      commands: [ListCommand],
    };
  },
};

function getLockFileKey(packageName, versionSpecifier) {
  // If the version field contains a URL, don't attempt to use the NPM registry
  return versionSpecifier.includes(":")
    ? `${packageName}@${versionSpecifier}`
    : `${packageName}@npm:${versionSpecifier}`;
}

/**
 * @param resolved All the resolved dependencies as found in the lock file.
 * @param dependencyKey Key of the dependency to look up. Can be created using
 *                      `lockFileKey()`.
 */
function lookup(resolved, dependencyKey) {
  const packageInfo = resolved[dependencyKey];
  if (packageInfo) {
    return packageInfo;
  }

  // Fall back to slower iteration-based lookup for combined keys.
  for (const [key, packageInfo] of Object.entries(resolved)) {
    if (key.split(",").some((key) => key.trim() === dependencyKey)) {
      return packageInfo;
    }
  }
}
