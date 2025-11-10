import { Server, ValidationResult } from "./types.ts";

/**
 * Validates a server configuration object.
 *
 * Checks:
 * - ID format (lowercase alphanumeric with hyphens)
 * - Label is non-empty
 * - Server version is specified
 * - Port is in valid range (1000-65535)
 *
 * @param server - Server configuration to validate
 * @returns ValidationResult with valid flag and error messages
 *
 * @example
 * ```ts
 * const result = validateServer({
 *   id: "demo",
 *   label: "Demo",
 *   port: 9100,
 *   serverVersion: "1.6.7"
 * });
 * // => { valid: true, errors: [] }
 *
 * const badResult = validateServer({
 *   id: "DEMO",  // Invalid: uppercase
 *   label: "",   // Invalid: empty
 *   port: 99,    // Invalid: too low
 *   serverVersion: ""  // Invalid: empty
 * });
 * // => { valid: false, errors: [...] }
 * ```
 */
export function validateServer(server: Server): ValidationResult {
  const errors: string[] = [];

  if (!server.id || !/^[a-z0-9-]+$/.test(server.id)) {
    errors.push("ID must be lowercase alphanumeric with hyphens");
  }

  if (!server.label || server.label.trim().length === 0) {
    errors.push("Label is required");
  }

  if (!server.serverVersion || server.serverVersion.trim().length === 0) {
    errors.push("Server version is required");
  }

  if (!server.port || server.port < 1000 || server.port > 65535) {
    errors.push("Port must be between 1000 and 65535");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks if a server ID already exists in the servers list.
 *
 * @param servers - Array of existing servers
 * @param id - ID to check for conflicts
 * @param excludeId - Optional ID to exclude from conflict check (for updates)
 * @returns The conflicting server or null if no conflict
 *
 * @example
 * ```ts
 * const servers = [{ id: "demo", ... }, { id: "prod", ... }];
 *
 * checkIdConflict(servers, "demo");
 * // => { id: "demo", ... } (conflict found)
 *
 * checkIdConflict(servers, "demo", "demo");
 * // => null (excluded from check)
 *
 * checkIdConflict(servers, "staging");
 * // => null (no conflict)
 * ```
 */
export function checkIdConflict(
  servers: Server[],
  id: string,
  excludeId?: string
): Server | null {
  return servers.find((s) => s.id === id && s.id !== excludeId) || null;
}