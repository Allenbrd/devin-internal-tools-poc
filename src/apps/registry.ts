/**
 * App registry: the one file a new app is added to.
 * - `apps`: manifests (nav entry + permissions and role grants)
 * - `sensitiveResources`: record types with masked fields
 */
import { customersApp } from "./customers/manifest";
import { customerResource } from "./customers/sensitive";
import { refundsApp } from "./refunds/manifest";
import { refundResource } from "./refunds/sensitive";
import { flagsApp } from "./flags/manifest";

export const apps = [customersApp, refundsApp, flagsApp] as const;

export const sensitiveResources = [customerResource, refundResource] as const;
