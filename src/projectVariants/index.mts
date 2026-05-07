import { CCppProjectVariant } from "./cCppVariant.mjs";
import { DefaultProjectVariantRegistry } from "./registry.mjs";
import { RustProjectVariant } from "./rustVariant.mjs";
import { ZephyrProjectVariant } from "./zephyrVariant.mjs";

export function createProjectVariantRegistry(): DefaultProjectVariantRegistry {
  return new DefaultProjectVariantRegistry([
    new RustProjectVariant(),
    new ZephyrProjectVariant(),
    new CCppProjectVariant(),
  ]);
}

export type {
  PicoProjectVariant,
  ProjectSelections,
  ProjectVariantId,
} from "./types.mjs";
