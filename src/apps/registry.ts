/**
 * App registry: the one file a new app is added to.
 * - `apps`: manifests (nav entry + permissions and role grants)
 * - `sensitiveResources`: record types with masked fields
 */
import { customersApp } from "./customers/manifest";
import { customerResource } from "./customers/sensitive";

export const apps = [customersApp] as const;

export const sensitiveResources = [customerResource] as const;
