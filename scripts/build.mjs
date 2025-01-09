import { execSync } from 'child_process';
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'fs';
import { getL10nJson } from '@vscode/l10n-dev';
import { join } from 'path';

const buildEnv = process.env.BUILD_ENV || 'production';
const sourcemap = buildEnv === 'production' ? 'hidden' : 'true';

console.debug("Generating updated English translation files")

const files = readdirSync("./src", { recursive: true });
const fileContents = files.filter(filename => lstatSync(join("./src", filename)).isFile()).map(filename => ({
    extension: ".ts",
    contents: readFileSync(join("./src", filename), 'utf8')
}));
console.debug(`Found ${fileContents.length} TypeScript files`);

const result = await getL10nJson(fileContents);
console.debug(`Extracted ${Object.keys(result).length} strings`);

console.debug(`Writing extracted strings`);
writeFileSync(join("./l10n", 'bundle.l10n.json'), JSON.stringify(result, undefined, 2));

console.debug("Checking other translation files for missing translations");
const translations = readdirSync("./l10n").filter(filename => filename !== "bundle.l10n.json").map(filename => ({
    language: filename.match(/bundle\.l10n\.(.*)\.json/)[1],
    json: JSON.parse(readFileSync(join("./l10n", filename), 'utf8'))
}));
const allStrings = Object.getOwnPropertyNames(result);
translations.forEach(translation => {
    allStrings.forEach(str => {
        if (!(str in translation.json)) {
            console.warn(`${translation.language} is missing "${str}"`);
        }
    });
    Object.getOwnPropertyNames(translation.json).forEach(str => {
        if (!(str in result)) {
            console.warn(`${translation.language} has extra "${str}"`);
        }
    });
});



console.debug("Building with:\nenvironment =", buildEnv, "\nsourcemap =", sourcemap, "(out of order, always true)");

const command = `rollup -c --environment BUILD:${buildEnv}`;
execSync(command, { stdio: 'inherit' });
