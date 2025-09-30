import { execSync } from 'child_process';

const buildEnv = process.env.BUILD_ENV || 'production';

console.debug("Building with:\nenvironment =", buildEnv);

const command = `webpack --mode ${buildEnv}`;
execSync(command, { stdio: 'inherit' });
console.debug("Build complete.");
