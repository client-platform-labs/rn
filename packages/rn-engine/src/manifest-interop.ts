import {
  validateManifestText,
  type ManifestValidationResult,
} from "@client-platform/core";
import { validateExpoInteropConfig } from "./expo-interop.js";

/** Core manifest validation + RN-engine interop (Expo SDK↔RN) validation. */
export function validateManifestTextWithInterop(
  text: string,
): ManifestValidationResult {
  const result = validateManifestText(text);
  if (!result.ok) {
    return result;
  }
  const interopErrors = validateExpoInteropConfig(result.manifest.interop);
  if (interopErrors.length > 0) {
    return { ok: false, errors: interopErrors };
  }
  return result;
}
