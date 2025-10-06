import { workspace, Uri } from "vscode";
import * as ini from "ini";
import { homedir } from "os";

// Known sections
export interface ManifestSection {
  path?: string;
  file?: string;
  ["project-filter"]?: string;
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

/** Escape a string to be used as a literal regex */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split a project-filter string into normalized elements */
function splitProjectFilter(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(e => e.trim())
    .filter(Boolean);
}

/** Keep only non-zephyr filter elements (so we can rebuild zephyr rules) */
function keepNonZephyrFilters(elements: string[]): string[] {
  // Remove any rule that targets zephyr-* (e.g., +zephyr-foo, -zephyr-.*)
  return elements.filter(e => !/^[+-]\s*zephyr-/.test(e));
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
  if (config.zephyr === undefined || Object.keys(config.zephyr).length === 0) {
    throw new Error("zephyr section is required");
  }
  const text = ini.stringify(config, { whitespace: true });
  await writeTextFile(configUri, text);
}

/** Get `[zephyr] base` */
export async function getZephyrBase(): Promise<string | undefined> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);

  return cfg.zephyr?.base;
}

/** Set `[manifest] project-filter` directly */
export async function setManifestProjectFilter(value: string): Promise<void> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);
  if (!cfg.manifest) {
    cfg.manifest = {};
  }
  cfg.manifest["project-filter"] = value;
  await saveWestConfig(WEST_CONFIG_URI, cfg);
}

/** Get `[manifest] project-filter` */
export async function getManifestProjectFilter(): Promise<string | undefined> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);

  return cfg.manifest?.["project-filter"];
}

/**
 * Update `[manifest] project-filter` so that:
 *  - all `zephyr-*` projects are deactivated, except the active one
 *  - any non-zephyr rules are preserved
 */
function updateProjectFilterForZephyrBase(
  cfg: WestConfig,
  activeZephyrProjectName: string
): void {
  if (!cfg.manifest) {
    cfg.manifest = {};
  }

  const current = cfg.manifest["project-filter"];
  const existing = splitProjectFilter(current);
  const kept = keepNonZephyrFilters(existing);

  const escaped = escapeRegexLiteral(activeZephyrProjectName);

  // Order matters; last rule wins.
  // Deactivate all zephyr-* first, then explicitly re-activate the chosen one.
  const rebuilt = [...kept, "-zephyr-.*", `+${escaped}`];

  // dedupe while preserving order
  const final = Array.from(new Set(rebuilt));

  cfg.manifest["project-filter"] = final.join(",");
}

/** Set `[zephyr] base` */
export async function updateZephyrBase(
  newBase: string,
  updateProjectFilter: boolean = true
): Promise<void> {
  const cfg = await loadWestConfig(WEST_CONFIG_URI);
  if (!cfg.zephyr) {
    cfg.zephyr = {};
  }
  cfg.zephyr.base = newBase;

  if (updateProjectFilter) {
    updateProjectFilterForZephyrBase(cfg, newBase);
  }

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
