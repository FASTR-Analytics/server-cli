import { Server, ValidationResult } from "./types.ts";
import { validateServer, checkIdConflict } from "./validation.ts";

/**
 * ServerStore provides CRUD operations for server configurations stored in JSON.
 *
 * All write operations are atomic using a temporary file + rename strategy.
 * Servers are automatically sorted by ID after modifications.
 *
 * @example
 * ```ts
 * const store = new ServerStore("/path/to/servers.json");
 *
 * // Read all servers
 * const servers = await store.read();
 *
 * // Add a new server
 * await store.add({
 *   id: "demo",
 *   label: "Demo Server",
 *   port: 9100,
 *   serverVersion: "1.6.7",
 *   french: false,
 *   ethiopian: false,
 *   openAccess: true
 * });
 *
 * // Update a server
 * await store.update("demo", { port: 9200 });
 *
 * // Query by tag
 * const prodServers = await store.getByTag("production");
 * ```
 */
export class ServerStore {
  constructor(private filePath: string) {}

  async read(): Promise<Server[]> {
    try {
      const text = await Deno.readTextFile(this.filePath);
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  async write(servers: Server[]): Promise<void> {
    const temp = `${this.filePath}.tmp`;
    await Deno.writeTextFile(temp, JSON.stringify(servers, null, 2));
    await Deno.rename(temp, this.filePath);
  }

  async get(id: string): Promise<Server | null> {
    const servers = await this.read();
    return servers.find((s) => s.id === id) || null;
  }

  async add(server: Server): Promise<void> {
    const servers = await this.read();

    const validation = validateServer(server);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    const idConflict = checkIdConflict(servers, server.id);
    if (idConflict) {
      throw new Error(`Server with ID '${server.id}' already exists`);
    }


    servers.push(server);
    servers.sort((a, b) => a.id.localeCompare(b.id));
    await this.write(servers);
  }

  async update(id: string, changes: Partial<Server>): Promise<void> {
    const servers = await this.read();
    const index = servers.findIndex((s) => s.id === id);

    if (index === -1) {
      throw new Error(`Server '${id}' not found`);
    }

    const updated = { ...servers[index], ...changes };

    const validation = validateServer(updated);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    servers[index] = updated;
    servers.sort((a, b) => a.id.localeCompare(b.id));
    await this.write(servers);
  }

  async remove(id: string): Promise<void> {
    const servers = await this.read();
    const filtered = servers.filter((s) => s.id !== id);
    
    if (filtered.length === servers.length) {
      throw new Error(`Server '${id}' not found`);
    }
    
    await this.write(filtered);
  }

  async validate(): Promise<{ servers: Server[]; errors: Map<string, string[]> }> {
    const servers = await this.read();
    const errors = new Map<string, string[]>();

    for (const server of servers) {
      const validation = validateServer(server);
      if (!validation.valid) {
        errors.set(server.id, validation.errors);
      }
    }

    return { servers, errors };
  }

  async backup(): Promise<string> {
    const timestamp = new Date().toISOString()
      .replace(/:/g, "-")
      .replace(/\./g, "-");
    const backupPath = `${this.filePath}.backup.${timestamp}`;
    
    try {
      await Deno.copyFile(this.filePath, backupPath);
    } catch {
      // File might not exist yet, that's okay
    }
    
    return backupPath;
  }

  async restore(backupPath: string): Promise<void> {
    await Deno.copyFile(backupPath, this.filePath);
  }

  async getByTag(tag: string): Promise<Server[]> {
    const servers = await this.read();
    return servers.filter(server => server.tags?.includes(tag) || false);
  }

  async getByTags(tags: string[]): Promise<Server[]> {
    const servers = await this.read();
    return servers.filter(server =>
      tags.some(tag => server.tags?.includes(tag) || false)
    );
  }

  async addTags(id: string, tagsToAdd: string[]): Promise<void> {
    const servers = await this.read();
    const index = servers.findIndex(s => s.id === id);

    if (index === -1) {
      throw new Error(`Server '${id}' not found`);
    }

    const server = servers[index];
    const currentTags = server.tags || [];
    const newTags = [...new Set([...currentTags, ...tagsToAdd])];

    servers[index] = { ...server, tags: newTags };
    await this.write(servers);
  }

  async removeTags(id: string, tagsToRemove: string[]): Promise<void> {
    const servers = await this.read();
    const index = servers.findIndex(s => s.id === id);

    if (index === -1) {
      throw new Error(`Server '${id}' not found`);
    }

    const server = servers[index];
    const currentTags = server.tags || [];
    const newTags = currentTags.filter(tag => !tagsToRemove.includes(tag));

    servers[index] = { ...server, tags: newTags.length > 0 ? newTags : undefined };
    await this.write(servers);
  }

  async getByVersion(version: string): Promise<Server[]> {
    const servers = await this.read();
    return servers.filter(server => server.serverVersion === version);
  }
}