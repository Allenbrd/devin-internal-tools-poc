import { sensitiveResources } from "@/apps/registry";
import type { AnySensitiveResource } from "./define";

let byType: Map<string, AnySensitiveResource> | undefined;

function index(): Map<string, AnySensitiveResource> {
  if (byType) return byType;
  const map = new Map<string, AnySensitiveResource>();
  for (const resource of sensitiveResources as readonly AnySensitiveResource[]) {
    if (map.has(resource.type)) throw new Error(`Duplicate sensitive resource "${resource.type}"`);
    map.set(resource.type, resource);
  }
  return (byType = map);
}

export function getSensitiveResource(type: string | null | undefined): AnySensitiveResource | undefined {
  return type ? index().get(type) : undefined;
}
