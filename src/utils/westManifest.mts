/* eslint-disable @typescript-eslint/naming-convention */
import { homedir } from "os";
import { workspace, Uri } from "vscode";
import YAML from "yaml";

type Remote = {
  name: string;
  /** YAML key: url-base */
  ["url-base"]: string;
};

type Project = {
  name: string;
  ["repo-path"]?: string;
  remote?: string;
  revision?: string;
  path?: string;
  /** Keep YAML dash key as-is */
  import?: {
    ["name-allowlist"]?: string[];
  };
  // Allow extra fields without type errors
  [k: string]: unknown;
};

type ManifestDoc = {
  manifest: {
    self?: Record<string, unknown>;
    remotes?: Remote[];
    projects?: Project[];
    [k: string]: unknown;
  };
};

const DEFAULT_MANIFEST: ManifestDoc = {
  manifest: {
    self: { "west-commands": "scripts/west-commands.yml" },
    remotes: [
      {
        name: "zephyrproject-rtos",
        "url-base": "https://github.com/zephyrproject-rtos",
      },
    ],
    projects: [],
  },
};

const MANIFEST_URI = Uri.joinPath(
  Uri.file(homedir()),
  ".pico-sdk",
  "zephyr_workspace",
  "manifest",
  "west.yml"
);

function slugifyRevision(rev: string): string {
  // Keep common chars, collapse others to '-'
  return rev
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
}

/** Safely read a text file via workspace.fs; returns undefined if it doesn't exist. */
async function readTextFile(uri: Uri): Promise<string | undefined> {
  try {
    const data = await workspace.fs.readFile(uri);

    return Buffer.from(data).toString("utf8");
  } catch {
    return undefined;
  }
}

/** Write a text file, creating parent directories if needed. */
async function writeTextFile(uri: Uri, text: string): Promise<void> {
  // Ensure parent directory exists
  const parent = Uri.joinPath(uri, "..");
  await workspace.fs.createDirectory(parent);
  await workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
}

/** Load the west manifest. If the file doesn't exist, returns a default skeleton. */
export async function loadManifest(manifestUri: Uri): Promise<ManifestDoc> {
  const raw = await readTextFile(manifestUri);
  if (!raw || raw.trim() === "") {
    // Return a deep clone of default to avoid mutation side effects
    return YAML.parse(YAML.stringify(DEFAULT_MANIFEST)) as ManifestDoc;
  }
  try {
    const parsed = YAML.parse(raw) as ManifestDoc | undefined;
    if (!parsed || typeof parsed !== "object" || !("manifest" in parsed)) {
      // Malformed file, fall back to default but don't throw
      return YAML.parse(YAML.stringify(DEFAULT_MANIFEST)) as ManifestDoc;
    }
    // Normalize optional arrays
    parsed.manifest.remotes ??= [];
    parsed.manifest.projects ??= [];

    return parsed;
  } catch {
    // YAML parse error -> non-fatal: start from default
    return YAML.parse(YAML.stringify(DEFAULT_MANIFEST)) as ManifestDoc;
  }
}

/** Persist the manifest back to disk with stable formatting. */
export async function saveManifest(
  manifestUri: Uri,
  doc: ManifestDoc
): Promise<void> {
  // Ensure required structure
  doc.manifest.remotes ??= [];
  doc.manifest.projects ??= [];
  const text = YAML.stringify(doc, { lineWidth: 0 }); // keep long lines intact
  await writeTextFile(manifestUri, text);
}

/** List all projects as lightweight objects. */
export async function listProjects(): Promise<Project[]> {
  const doc = await loadManifest(MANIFEST_URI);

  return [...(doc.manifest.projects ?? [])];
}

/** Human-readable summary of what's present (name, path, revision, remote). */
export async function listProjectsSummary(): Promise<string> {
  const projects = await listProjects();
  if (projects.length === 0) {
    return "No projects present in manifest.";
  }
  const lines = projects.map(p => {
    const bits = [
      `name=${p.name}`,
      p.path ? `path=${p.path}` : undefined,
      p.revision ? `revision=${p.revision}` : undefined,
      p.remote ? `remote=${p.remote}` : undefined,
    ].filter(Boolean);

    return `- ${bits.join(", ")}`;
  });

  return ["Projects:", ...lines].join("\n");
}

/**
 * Add or update a project by name.
 * If a project exists, it's updated shallowly with provided fields; otherwise it's appended.
 */
export async function upsertProject(project: Project): Promise<void> {
  if (!project?.name) {
    throw new Error("upsertProject: 'name' is required.");
  }

  const doc = await loadManifest(MANIFEST_URI);
  const projects = doc.manifest.projects ?? (doc.manifest.projects = []);
  const idx = projects.findIndex(p => p.name === project.name);

  if (idx >= 0) {
    projects[idx] = { ...projects[idx], ...project };
  } else {
    projects.push({ ...project });
  }

  await saveManifest(MANIFEST_URI, doc);
}

/**
 * Add a project that mirrors the existing "zephyr" project's structure (remote & import),
 * but with a different name/path/revision. If "zephyr" is not found, it falls back to
 * the default remote "zephyrproject-rtos" and no import filter.
 */
export async function addZephyrVariant(revision: string): Promise<void> {
  const doc = await loadManifest(MANIFEST_URI);
  const projects = doc.manifest.projects ?? (doc.manifest.projects = []);

  // Look for canonical "zephyr" entry to copy fields from.
  const zephyrBase = projects.find(p => p.name === "zephyr-main");
  if (!zephyrBase) {
    throw new Error(
      'addZephyrVariant: base project "zephyr-main" not found in manifest.'
    );
  }

  const revSlug = slugifyRevision(revision);
  // Guard: don’t duplicate main
  if (revSlug === "main") {
    // Nothing to do — zephyr-main already represents main
    return;
  }

  const name = `zephyr-${revSlug}`;
  const path = name;

  const baseRemote =
    zephyrBase.remote ??
    (doc.manifest.remotes ?? []).find(r => r.name === "zephyrproject-rtos")
      ?.name ??
    "zephyrproject-rtos";

  const baseImport =
    zephyrBase.import && typeof zephyrBase.import === "object"
      ? { ...zephyrBase.import }
      : undefined;

  const newProj: Project = {
    name,
    remote: baseRemote,
    revision,
    path,
    ["repo-path"]: "zephyr",
    ...(baseImport ? { import: baseImport } : {}),
  };

  // If it already exists by name, update; else add.
  const idxExisting = projects.findIndex(p => p.name === name);
  if (idxExisting >= 0) {
    projects[idxExisting] = { ...projects[idxExisting], ...newProj };
  } else {
    projects.push(newProj);
  }

  await saveManifest(MANIFEST_URI, doc);
}

/**
 * Ensure a remote exists (by name). Adds it if missing.
 * Useful when preparing to add non-zephyr remotes.
 */
export async function ensureRemote(remote: Remote): Promise<void> {
  const doc = await loadManifest(MANIFEST_URI);
  const remotes = doc.manifest.remotes ?? (doc.manifest.remotes = []);
  const i = remotes.findIndex(r => r.name === remote.name);
  if (i >= 0) {
    remotes[i] = { ...remotes[i], ...remote };
  } else {
    remotes.push(remote);
  }
  await saveManifest(MANIFEST_URI, doc);
}

/**
 * Convenience helper to quickly check if a project exists.
 */
export async function hasProject(name: string): Promise<boolean> {
  const projects = await listProjects();

  return projects.some(p => p.name === name);
}
