import type { WorkspaceFolder } from "vscode";
import type {
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectVariantId,
  ProjectVariantRegistry,
} from "./types.mjs";

export class DefaultProjectVariantRegistry implements ProjectVariantRegistry {
  public constructor(private readonly variants: PicoProjectVariant[]) {}

  public async detect(
    folder: WorkspaceFolder
  ): Promise<ProjectDetectionResult> {
    let firstUnsupported: ProjectDetectionResult | undefined;

    for (const variant of this.variants) {
      const result = await variant.detect(folder);
      if (result.kind === "supported") {
        return result;
      }

      firstUnsupported ??= result;
    }

    return (
      firstUnsupported ?? {
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
    const result = await this.detect(folder);

    return result.kind === "supported" ? this.get(result.variant) : undefined;
  }
}
