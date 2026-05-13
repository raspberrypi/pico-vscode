import { CCppProjectVariant } from "./cCppVariant.mjs";
import { DefaultProjectVariantRegistry } from "./registry.mjs";
import { RustProjectVariant } from "./rustVariant.mjs";
import { ZephyrProjectVariant } from "./zephyrVariant.mjs";

const projectVariantRegistry = new DefaultProjectVariantRegistry([
  new RustProjectVariant(),
  new ZephyrProjectVariant(),
  new CCppProjectVariant(),
]);

export function getProjectVariantRegistry(): DefaultProjectVariantRegistry {
  return projectVariantRegistry;
}

export function createProjectVariantRegistry(): DefaultProjectVariantRegistry {
  return getProjectVariantRegistry();
}

export type {
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectSelections,
  ProjectVariantId,
} from "./types.mjs";
