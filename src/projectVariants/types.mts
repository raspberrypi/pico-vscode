import type { ExtensionContext, Uri, WorkspaceFolder } from "vscode";
import type Settings from "../settings.mjs";
import type UI from "../ui.mjs";

export type ProjectVariantId = "c-cpp" | "rust" | "zephyr";

export interface ProjectContextFlags {
  isPicoProject: boolean;
  isRustProject: boolean;
  isZephyrProject: boolean;
}

export interface ProjectSelections {
  sdkVersion?: string;
  toolchainVersion?: string;
  picotoolVersion?: string;
  boardId?: string;
  boardLabel?: string;
  chip?: "rp2040" | "rp2350" | "rp2350-riscv" | "rp235x";
  target?: "rp2040" | "rp2350" | "rp2350-riscv";
}

export type ProjectDetectionResult =
  | { kind: "supported"; variant: ProjectVariantId }
  | { kind: "unsupported"; reason: string; offerImport?: boolean };

export interface ProjectVariantInput {
  context: ExtensionContext;
  settings: Settings;
}

export interface EnsureDependenciesInput extends ProjectVariantInput {
  folder: WorkspaceFolder;
  selections: ProjectSelections;
}

export interface UpdateProjectUiInput {
  ui: UI;
  selections: ProjectSelections;
}

export interface AfterActivationInput extends ProjectVariantInput {
  folder: WorkspaceFolder;
  selections: ProjectSelections;
  ui: UI;
}

export interface PicoProjectVariant {
  readonly id: ProjectVariantId;
  readonly context: ProjectContextFlags;

  detect(
    folder: WorkspaceFolder
  ): ProjectDetectionResult | Promise<ProjectDetectionResult>;
  readSelections(
    folder: WorkspaceFolder
  ): ProjectSelections | null | Promise<ProjectSelections | null>;
  ensureDependencies(
    input: EnsureDependenciesInput
  ): boolean | Promise<boolean>;
  updateUi(input: UpdateProjectUiInput): void | Promise<void>;
  afterActivation?(input: AfterActivationInput): boolean | Promise<boolean>;
}

export interface ProjectVariantRegistry {
  detect(folder: WorkspaceFolder): Promise<ProjectDetectionResult>;
  get(id: ProjectVariantId): PicoProjectVariant;
  getActive(folder: WorkspaceFolder): Promise<PicoProjectVariant | undefined>;
}

export function projectRootUri(folder: WorkspaceFolder): Uri {
  return folder.uri;
}
