// Extracts translatable strings into l10n/bundle.l10n.json, checks the
// translations in l10n/ and package.nls.*.json against the English sources,
// and writes the bundles the extension loads to dist/l10n.
//
// When English text is reworded, its old translations no longer match. An
// entry in l10n/renames.json ("new text": "old text") makes dist/l10n use the
// old translation for the new text until the language is updated.
//
// Usage: node scripts/l10n.mjs [--check] [--pseudo]
//   --check   don't write anything, exit 1 if bundle.l10n.json is out of date
//             or a translation has problems (run by `npm run lint`). Without
//             it, problems are reported but don't fail, so they don't block
//             builds or debugging.
//   --pseudo  also regenerate the qps-ploc pseudo-translations, for testing
//             with the Pseudo Language pack

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "fs";
import { join, relative } from "path";
import { getL10nJson, getL10nPseudoLocalized } from "@vscode/l10n-dev";

const root = join(import.meta.dirname, "..");
const l10nDir = join(root, "l10n");
const distDir = join(root, "dist", "l10n");
const englishBundlePath = join(l10nDir, "bundle.l10n.json");
const renamesPath = join(l10nDir, "renames.json");
const check = process.argv.includes("--check");
const pseudo = process.argv.includes("--pseudo");
let problems = 0;

function problem(msg) {
  console.error(msg);
  problems++;
}

function listFiles(dir, filter) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && filter(join(e.parentPath, e.name)))
    .map(e => join(e.parentPath, e.name));
}

const sources = [
  ...listFiles(join(root, "src"), f => f.endsWith(".mts")).map(path => ({
    path,
    extension: ".ts",
    contents: readFileSync(path, "utf8"),
  })),
  // The webview scripts use a global l10n.t (see getL10nScript), which the
  // extractor only recognises after an import of it
  ...listFiles(
    join(root, "web"),
    f =>
      f.endsWith(".js") &&
      !f.includes(`${join("web", "docs")}`) &&
      !f.includes("tailwindcss")
  ).map(path => ({
    path,
    extension: ".js",
    contents: 'import { l10n } from "vscode";\n' + readFileSync(path, "utf8"),
  })),
];

const english = await getL10nJson(sources);
const englishText = JSON.stringify(english, undefined, 2) + "\n";
console.log(
  `Extracted ${Object.keys(english).length} strings from ${sources.length} files`
);

if (check) {
  const current = existsSync(englishBundlePath)
    ? readFileSync(englishBundlePath, "utf8")
    : "";
  if (current !== englishText) {
    problem(
      `${relative(root, englishBundlePath)} is out of date, ` +
        "run `npm run l10n` and commit the result"
    );
  }
} else {
  writeFileSync(englishBundlePath, englishText);
}

const englishNls = JSON.parse(
  readFileSync(join(root, "package.nls.json"), "utf8")
);

if (pseudo && !check) {
  for (const [file, strings] of [
    ["bundle.l10n.qps-ploc.json", english],
    ["package.nls.qps-ploc.json", englishNls],
  ]) {
    const out = join(file.startsWith("bundle") ? l10nDir : root, file);
    const pseudoStrings = getL10nPseudoLocalized(strings);
    writeFileSync(out, JSON.stringify(pseudoStrings, undefined, 2) + "\n");
    console.log(`Wrote ${relative(root, out)}`);
  }
}

const englishMessage = v => (typeof v === "string" ? v : v.message);
const placeholders = s => [...s.matchAll(/{[^}]+}/g)].map(m => m[0]).sort();

// Characters a translation mustn't add, as strings are inserted into the
// webview HTML unescaped
const htmlSpecial = /[<>"&`]/;

const q = JSON.stringify;

function placeholderMismatch(sourceText, text) {
  return placeholders(sourceText).join() !== placeholders(text).join();
}

// renames.json maps a bundle key to the key it replaced. A key is the English
// text, or "text/comment" for strings with a translator comment. Entries can
// chain when a string is reworded more than once.
const renames = existsSync(renamesPath)
  ? JSON.parse(readFileSync(renamesPath, "utf8"))
  : {};
const usedRenames = new Set();
const renamedKeys = new Set(Object.values(renames));

for (const [newKey, oldKey] of Object.entries(renames)) {
  if (typeof oldKey !== "string") {
    problem(`renames.json: value for ${q(newKey)} must be a string`);
  } else if (!(newKey in english) && !renamedKeys.has(newKey)) {
    console.warn(
      `renames.json: ${q(newKey)} is no longer an English string, ` +
        "update or remove the entry"
    );
  } else if (oldKey in english) {
    console.warn(
      `renames.json: ${q(oldKey)} is still an English string, ` +
        `so its translation is also used for ${q(newKey)}`
    );
  }
}

// Previous wordings of a key, newest first
function olderKeys(key) {
  const keys = [];
  while (key in renames && !keys.includes(renames[key]) && keys.length < 20) {
    key = renames[key];
    keys.push(key);
  }

  return keys;
}

// Returns the bundle the extension should load: the translations of current
// strings, plus translations of old wordings for strings not yet updated
function checkBundle(name, translated) {
  const output = {};
  const carriedOver = {};

  for (const key of Object.keys(english)) {
    if (key in translated) {
      output[key] = englishMessage(translated[key]);
      continue;
    }
    const oldKey = olderKeys(key).find(k => k in translated);
    if (oldKey === undefined) {
      console.warn(`${name}: missing translation for ${q(key)}`);
      continue;
    }
    for (let k = key; k !== oldKey; k = renames[k]) {
      usedRenames.add(k);
    }
    const text = englishMessage(translated[oldKey]);
    const sourceText = englishMessage(english[key]);
    if (
      placeholderMismatch(sourceText, text) ||
      (htmlSpecial.test(text) && !htmlSpecial.test(sourceText))
    ) {
      console.warn(
        `${name}: missing translation for ${q(key)} (not using the one for ` +
          `${q(oldKey)}, its placeholders or HTML characters differ)`
      );
      continue;
    }
    console.warn(
      `${name}: missing translation for ${q(key)}, ` +
        `using the one for ${q(oldKey)} until it is updated`
    );
    carriedOver[oldKey] = key;
    output[key] = text;
  }

  for (const key of Object.keys(translated)) {
    if (key in carriedOver) {
      console.warn(
        `${name}: translation for old text ${q(key)} is used for ` +
          `${q(carriedOver[key])}, remove it once that is translated`
      );
    } else if (key in english) {
      continue;
    } else if (renamedKeys.has(key)) {
      console.warn(
        `${name}: translation for old text ${q(key)} is no longer used, ` +
          "remove it"
      );
    } else {
      problem(
        `${name}: unused translation for ${q(key)}. If its English was ` +
          "reworded, add the change to l10n/renames.json, otherwise remove " +
          "it from the translations"
      );
    }
  }

  return output;
}

function checkTranslations(name, translated, source) {
  for (const [key, value] of Object.entries(translated)) {
    if (!(key in source)) {
      continue;
    }
    const sourceText = englishMessage(source[key]);
    const text = englishMessage(value);
    if (placeholderMismatch(sourceText, text)) {
      problem(
        `${name}: placeholders differ for ${q(key)}: ` +
          `${placeholders(sourceText)} vs ${placeholders(text)}`
      );
    }
    if (htmlSpecial.test(text) && !htmlSpecial.test(sourceText)) {
      problem(`${name}: translation of ${q(key)} adds HTML characters`);
    }
  }
}

const outputBundles = {};
for (const file of readdirSync(l10nDir)) {
  if (/^bundle\.l10n\..+\.json$/.test(file)) {
    const translated = JSON.parse(readFileSync(join(l10nDir, file), "utf8"));
    checkTranslations(file, translated, english);
    outputBundles[file] = checkBundle(file, translated);
  }
}

for (const newKey of Object.keys(renames)) {
  const current = newKey in english || renamedKeys.has(newKey);
  if (current && !usedRenames.has(newKey)) {
    console.warn(
      `renames.json: no translation needs the entry for ${q(newKey)}, ` +
        "it can be removed"
    );
  }
}

for (const file of readdirSync(root)) {
  if (/^package\.nls\..+\.json$/.test(file)) {
    const translated = JSON.parse(readFileSync(join(root, file), "utf8"));
    checkTranslations(file, translated, englishNls);
    for (const key of Object.keys(englishNls)) {
      if (!(key in translated)) {
        console.warn(`${file}: missing translation for ${q(key)}`);
      }
    }
    for (const key of Object.keys(translated)) {
      if (!(key in englishNls)) {
        problem(
          `${file}: unused translation for ${q(key)}, ` +
            "remove it from the translations"
        );
      }
    }
  }
}

if (!check) {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  for (const [file, bundle] of Object.entries(outputBundles)) {
    writeFileSync(join(distDir, file), JSON.stringify(bundle) + "\n");
  }
}

// Every %key% in package.json needs an English string
const packageJson = readFileSync(join(root, "package.json"), "utf8");
for (const [, key] of packageJson.matchAll(/"%([^%"]+)%"/g)) {
  if (!(key in englishNls)) {
    problem(`package.json: %${key}% is missing from package.nls.json`);
  }
}

if (problems > 0) {
  if (check) {
    console.error(`${problems} localisation problem(s)`);
    process.exit(1);
  }
  console.warn(
    `${problems} localisation problem(s), which will fail \`npm run lint\``
  );
}
