import type { WorkspaceFolder } from "vscode";
import type {
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectVariantId,
  ProjectVariantRegistry,
} from "./types.mjs";

export class DefaultProjectVariantRegistry implements ProjectVariantRegistry {
  private readonly detectedVariants = new Map<string, ProjectVariantId>();

  public constructor(private readonly variants: PicoProjectVariant[]) {}

  public async detect(
    folder: WorkspaceFolder
  ): Promise<ProjectDetectionResult> {
    let fallbackUnsupported: ProjectDetectionResult | undefined;
    let importCandidate: ProjectDetectionResult | undefined;

    for (const variant of this.variants) {
      const result = await variant.detect(folder);
      if (result.kind === "supported") {
        return result;
      }

      fallbackUnsupported = result;
      if (result.offerImport) {
        importCandidate = result;
      }
    }

    return (
      importCandidate ??
      fallbackUnsupported ?? {
        kind: "unsupported",
        reason: "No supported Pico project markers were found.",
      }
    );
  }

  public get(id: ProjectVariantId): PicoProjectVariant {
    const variant = this.variants.find(candidate => candidate.id === id);
    if (variant === undefined) {
      throw new Error(`Project variant is not registered: ${id}`);
    }

    return variant;
  }

  public async getActive(
    folder: WorkspaceFolder
  ): Promise<PicoProjectVariant | undefined> {
    const folderUri = folder.uri.toString();
    const detectedVariant = this.detectedVariants.get(folderUri);
    if (detectedVariant !== undefined) {
      return this.get(detectedVariant);
    }

    const result = await this.detect(folder);
    if (result.kind === "supported") {
      this.detectedVariants.set(folderUri, result.variant);

      return this.get(result.variant);
    }

    return undefined;
  }
}
