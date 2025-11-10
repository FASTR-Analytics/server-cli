import { ServerStore } from "./server-store.ts";

/**
 * Resolves target selectors into a list of server IDs.
 *
 * Supports multiple selector types:
 * - Direct server ID (e.g., "demo", "production")
 * - Tag selector with @ prefix (e.g., "@production", "@staging")
 * - Version selector (e.g., "server=1.6.7")
 * - Special "all" keyword for all servers
 *
 * @param store - ServerStore instance to query servers
 * @param targets - Array of target selectors
 * @returns Promise resolving to unique array of server IDs
 * @throws Error if a tag or version has no matching servers
 *
 * @example
 * ```ts
 * // Single server
 * await resolveTargets(store, ["demo"]);
 * // => ["demo"]
 *
 * // Multiple servers with tag
 * await resolveTargets(store, ["@production"]);
 * // => ["server1", "server2", ...]
 *
 * // Version selector
 * await resolveTargets(store, ["server=1.6.7"]);
 * // => ["demo", "staging", ...]
 *
 * // All servers
 * await resolveTargets(store, ["all"]);
 * // => ["demo", "production", "staging", ...]
 * ```
 */
export async function resolveTargets(
  store: ServerStore,
  targets: string[]
): Promise<string[]> {
  const resolvedIds: string[] = [];

  for (const target of targets) {
    if (target === "all") {
      const allServers = await store.read();
      resolvedIds.push(...allServers.map(s => s.id));
    } else if (target.startsWith("@")) {
      const tag = target.slice(1);
      const servers = await store.getByTag(tag);
      if (servers.length === 0) {
        throw new Error(`No servers found with tag '${tag}'`);
      }
      resolvedIds.push(...servers.map(s => s.id));
    } else if (target.startsWith("server=")) {
      const version = target.slice(7); // Remove "server=" prefix
      const servers = await store.getByVersion(version);
      if (servers.length === 0) {
        throw new Error(`No servers found with version '${version}'`);
      }
      resolvedIds.push(...servers.map(s => s.id));
    } else {
      const server = await store.get(target);
      if (!server) {
        const servers = await store.getByTag(target);
        if (servers.length > 0) {
          resolvedIds.push(...servers.map(s => s.id));
        } else {
          throw new Error(`Server or tag '${target}' not found`);
        }
      } else {
        resolvedIds.push(target);
      }
    }
  }

  return [...new Set(resolvedIds)];
}