import { workspace, Uri } from "vscode";
import * as ini from "ini";
import { homedir } from "os";

// Known sections
export interface ManifestSection {
  path?: string;
  file?: string;
}

export interface ZephyrSection {
  base?: string;
}

// Generic section: any key→string
export interface Section {
  [key: string]: string | undefined;
}

// Full west config
export interface WestConfig {
  manifest?: ManifestSection & Section;
  zephyr?: ZephyrSection & Section;
  [section: string]: Section | undefined;
}

const WEST_CONFIG_URI = Uri.joinPath(
  Uri.file(homedir()),
  ".pico-sdk",
  "zephyr_workspace",
  ".west",
  "config"
);

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

function parentUri(uri: Uri): Uri {
  const path = uri.path.replace(/\/[^/]+$/, "");

  return uri.with({ path });
}

/** Read a text file, return undefined if not found */
async function readTextFile(uri: Uri): Promise<string | undefined> {
  try {
    const data = await workspace.fs.readFile(uri);

    return decoder.decode(data);
  } catch {
    return undefined;
  }
}

/** Write text file, ensuring parent dirs exist */
async function writeTextFile(uri: Uri, text: string): Promise<void> {
  await workspace.fs.createDirectory(parentUri(uri));
  let out = text;
  if (!out.endsWith("\n")) {
    out += "\n";
  }
  await workspace.fs.writeFile(uri, encoder.encode(out));
}

/** Load `.west/config` into a WestConfig object */
export async function loadWestConfig(configUri: Uri): Promise<WestConfig> {
  const raw = await readTextFile(configUri);
  if (!raw) {
    return {};
  }
  const parsed = ini.parse(raw);

  return parsed as unknown as WestConfig;
}

/** Save `.west/config` */
export async function saveWestConfig(
  configUri: Uri,
  config: WestConfig
): Promise<void> {
  const text = ini.stringify(config, { whitespace: true });
  await writeTextFile(configUri, text);
}

/** Get `[zephyr] base` */
export async function getZephyrBase(): Promise<string | undefined> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);

  return cfg.zephyr?.base;
}

/** Set `[zephyr] base` */
export async function updateZephyrBase(newBase: string): Promise<void> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);
  if (!cfg.zephyr) {
    cfg.zephyr = {};
  }
  cfg.zephyr.base = newBase;
  await saveWestConfig(WEST_CONFIG_URI, cfg);
}

/** Generic getter */
export async function getWestConfigValue(
  section: string,
  key: string
): Promise<string | undefined> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);

  return cfg[section]?.[key];
}

/** Generic setter */
export async function setWestConfigValue(
  section: string,
  key: string,
  value: string
): Promise<void> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);
  if (!cfg[section]) {
    cfg[section] = {};
  }
  cfg[section][key] = value;
  await saveWestConfig(WEST_CONFIG_URI, cfg);
}
