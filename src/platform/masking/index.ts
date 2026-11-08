// Pure definitions, safe to import anywhere (incl. app manifests / sensitive.ts).
// Server helpers: "@/platform/masking/server". UI: "@/platform/masking/client".
export { masks, maskLast4, scrubSensitivePatterns } from "./masks";
export { defineSensitiveResource, maskRecord } from "./define";
export type { Masked, MaskedField, SensitiveFieldSpec, SensitiveResource } from "./define";
