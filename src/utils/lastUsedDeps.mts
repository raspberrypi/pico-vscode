import { Uri, workspace, type Memento } from "vscode";
import {
  ALL_DEPS,
  type DependencyMeta,
  type DepId,
} from "../models/dependency.mjs";
import { homedir, platform } from "os";

const INSTALLED_STORAGE_KEY = "lastUsedDeps.v1";
const UNINSTALLED_STORAGE_KEY = "uninstalledDeps.v1";
const NON_VERSION_KEY = "__"; // sentinel for non-versioned deps

type VersionMap = Record<string, string>; // version -> YYYY-MM-DD (local)
type DepVersionDb = Record<DepId, VersionMap>; // dep -> VersionMap

/** YYYY-MM-DD in local time; day-resolution only */
function todayLocalISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function isRelevant(meta: DependencyMeta): boolean {
  return !meta.platforms || meta.platforms.includes(platform());
}

function metaFor(dep: DepId): DependencyMeta | undefined {
  return ALL_DEPS.find(d => d.id === dep);
}

function isVersioned(dep: DepId): boolean {
  const m = metaFor(dep);

  return m?.versioned !== false; // default: true
}

const INSTALL_ROOT_ALIAS: Partial<Record<DepId, string>> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "pico-sdk": "sdk",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "pico-sdk-tools": "tools",
};

const SDK_ROOT = Uri.joinPath(Uri.file(homedir()), ".pico-sdk");

function installRootName(dep: DepId): string {
  return INSTALL_ROOT_ALIAS[dep] ?? dep;
}

/** Resolve install folder for dep@version */
function installUriFor(dep: DepId, version?: string): Uri | undefined {
  const rootName = installRootName(dep);
  if (!isVersioned(dep)) {
    // ~/.pico-sdk/<rootName>
    return Uri.joinPath(SDK_ROOT, rootName);
  }
  if (!version) {
    return undefined;
  } // can't resolve path for versioned dep without version

  // ~/.pico-sdk/<rootName>/<version>
  return Uri.joinPath(SDK_ROOT, rootName, version);
}

async function pathExists(uri: Uri): Promise<boolean> {
  try {
    await workspace.fs.stat(uri);

    return true;
  } catch {
    return false;
  }
}

export default class LastUsedDepsStore {
  static #instance: LastUsedDepsStore;

  private globalState: Memento | undefined;

  private constructor() {}

  public static get instance(): LastUsedDepsStore {
    if (!LastUsedDepsStore.#instance) {
      LastUsedDepsStore.#instance = new LastUsedDepsStore();
    }

    return LastUsedDepsStore.#instance;
  }

  public setup(globalState: Memento): void {
    this.globalState = globalState;
  }

  private async save(db: DepVersionDb): Promise<void> {
    await this.globalState?.update(INSTALLED_STORAGE_KEY, db);
  }

  private load(): DepVersionDb {
    return (this.globalState?.get<DepVersionDb>(INSTALLED_STORAGE_KEY) ??
      {}) as DepVersionDb;
  }

  private async saveUn(db: DepVersionDb): Promise<void> {
    await this.globalState?.update(UNINSTALLED_STORAGE_KEY, db);
  }
  private loadUn(): DepVersionDb {
    return (this.globalState?.get<DepVersionDb>(UNINSTALLED_STORAGE_KEY) ??
      {}) as DepVersionDb;
  }

  /**
   * Record last-used = today (or supplied date) for a dep/version.
   * For versioned deps, `version` is REQUIRED.
   * For non-versioned deps, `version` is ignored.
   */
  public async record(
    dep: DepId,
    version?: string,
    date?: string
  ): Promise<void> {
    const db = this.load();
    const map: VersionMap = db[dep] ?? {};
    if (isVersioned(dep)) {
      if (!version) {
        throw new Error(
          `record(): version is required for versioned dependency "${dep}"`
        );
      }
      map[version] = date ?? todayLocalISO();
    } else {
      map[NON_VERSION_KEY] = date ?? todayLocalISO();
    }

    db[dep] = map;
    await this.save(db);
  }

  /**
   * Get last-used date (YYYY-MM-DD) for a dep/version.
   * For non-versioned deps, `version` is ignored.
   * Returns "" if absent.
   */
  public get(dep: DepId, version?: string): string {
    const db = this.load();
    const map = db[dep] ?? {};

    if (isVersioned(dep)) {
      if (!version) {
        return "";
      }

      return map[version] ?? "";
    } else {
      return map[NON_VERSION_KEY] ?? "";
    }
  }

  /**
   * Get all entries: dep -> (version -> date).
   * For non-versioned deps, a single entry under key "__".
   * If `onlyRelevant`, filters by current platform.
   */
  public async getAll(onlyRelevant = false): Promise<DepVersionDb> {
    const db = this.load();
    const out: DepVersionDb = {} as DepVersionDb;

    for (const meta of ALL_DEPS) {
      if (onlyRelevant && !isRelevant(meta)) {
        continue;
      }

      const dep = meta.id;
      const versions = db[dep] ?? {};
      const filtered: VersionMap = {};

      // No records at all? Skip unless onlyRelevant=false (we still return empty map then)
      const entries = Object.entries(versions);
      if (entries.length === 0) {
        if (!onlyRelevant) {
          out[dep] = {};
        }
        continue;
      }

      if (!onlyRelevant) {
        out[dep] = { ...versions };
        continue;
      }

      // onlyRelevant === true → also require that the install path exists
      for (const [verKey, date] of entries) {
        const version = isVersioned(dep) ? verKey : undefined;
        const uri = installUriFor(dep, version);
        if (!uri) {
          continue;
        } // can't determine a path without version
        // For non-versioned, verKey is "__"; version is undefined
        if (await pathExists(uri)) {
          filtered[verKey] = date;
        }
      }
      if (Object.keys(filtered).length > 0) {
        out[dep] = filtered;
      }
      // If nothing is installed, dep is omitted entirely.
    }

    return out;
  }

  public async recordUninstalled(
    dep: DepId,
    version?: string,
    date?: string
  ): Promise<void> {
    const un = this.loadUn();
    const map: VersionMap = un[dep] ?? {};
    const key = isVersioned(dep) ? version ?? "" : NON_VERSION_KEY;
    if (isVersioned(dep) && !version) {
      throw new Error(`recordUninstalled(): version required for "${dep}"`);
    }
    map[key] = date ?? todayLocalISO();
    un[dep] = map;
    await this.saveUn(un);
  }

  /** Has dep@version been recorded as uninstalled? */
  public wasUninstalled(dep: DepId, version?: string): boolean {
    const un = this.loadUn();
    const map = un[dep] ?? {};
    const key = isVersioned(dep) ? version ?? "" : NON_VERSION_KEY;

    return Boolean(map[key]);
  }

  /** Get all uninstall records (optionally filter by platform relevance only). */
  public getAllUninstalled(onlyRelevant = false): DepVersionDb {
    const un = this.loadUn();
    if (!onlyRelevant) {
      return un;
    }

    const out: DepVersionDb = {} as DepVersionDb;
    for (const meta of ALL_DEPS) {
      if (!isRelevant(meta)) {
        continue;
      }
      const dep = meta.id;
      if (un[dep]) {
        out[dep] = { ...un[dep] };
      }
    }

    return out;
  }

  /**
   * Clear entries.
   *
   * @param dep If given, clear only this dep; otherwise clear all.
   */
  public async clear(dep?: DepId, version?: string): Promise<void> {
    if (!dep) {
      await this.globalState?.update(INSTALLED_STORAGE_KEY, undefined);

      return;
    }

    const db = this.load();
    if (!db[dep]) {
      return;
    }

    if (version && isVersioned(dep)) {
      delete db[dep][version];
      if (Object.keys(db[dep]).length === 0) {
        delete db[dep];
      }
      await this.save(db);

      return;
    }

    // clear all for dep
    delete db[dep];
    await this.save(db);
  }

  /** Clear uninstall records (same semantics as clear). */
  public async clearUninstalled(dep?: DepId, version?: string): Promise<void> {
    if (!dep) {
      await this.globalState?.update(UNINSTALLED_STORAGE_KEY, undefined);

      return;
    }
    const un = this.loadUn();
    if (!un[dep]) {
      return;
    }

    if (version && isVersioned(dep)) {
      delete un[dep][version];
      if (Object.keys(un[dep]).length === 0) {
        delete un[dep];
      }
      await this.saveUn(un);

      return;
    }
    delete un[dep];
    await this.saveUn(un);
  }
}
