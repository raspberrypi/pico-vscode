import { execSync } from 'child_process';

const buildEnv = process.env.BUILD_ENV || 'production';

console.debug("Updating l10n/bundle.l10n.json");
execSync("node scripts/l10n.mjs", { stdio: "inherit" });

console.debug("Building with:\nenvironment =", buildEnv);

const command = `webpack --mode ${buildEnv}`;
execSync(command, { stdio: 'inherit' });
console.debug("Build complete.");
