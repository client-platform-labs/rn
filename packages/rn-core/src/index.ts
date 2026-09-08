/**
 * rn-core is the legacy bridge (ADR-022 expand): re-exports core + rn-engine
 * so existing consumers keep working during migration. New code should import
 * from @client-platform/core or @client-platform/rn-engine directly.
 */
export * from "@client-platform/core";
export * from "@client-platform/rn-engine";
export const packageName = "@client-platform/rn-core" as const;
