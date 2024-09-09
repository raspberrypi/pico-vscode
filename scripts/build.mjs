import { execSync } from 'child_process';

const buildEnv = process.env.BUILD_ENV || 'production';
const sourcemap = buildEnv === 'production' ? 'hidden' : 'true';

console.debug("Building with:\nenvironment =", buildEnv, "\nsourcemap =", sourcemap);

const command = `rollup -c --environment BUILD:${buildEnv} --sourcemap ${sourcemap}`;
execSync(command, { stdio: 'inherit' });
