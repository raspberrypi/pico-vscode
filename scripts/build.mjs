import { execSync } from 'child_process';

const buildEnv = process.env.BUILD_ENV || 'production';
const sourcemap = buildEnv === 'production' ? 'hidden' : 'true';

console.debug("Building with:\nenvironment =", buildEnv, "\nsourcemap =", sourcemap, "(out of order, always true)");

const command = `rollup -c --environment BUILD:${buildEnv}`;
execSync(command, { stdio: 'inherit' });
