import { Server } from "./types.ts";

export function allocatePort(servers: Server[], excludeId?: string): number {
  const existingPorts = servers
    .filter(s => s.id !== excludeId)
    .map(s => s.port)
    .filter(port => port >= 3000);

  if (existingPorts.length === 0) {
    return 3000; // Start from 3000 if no existing ports
  }

  return Math.max(...existingPorts) + 1;
}

export function getPostgresPort(serverPort: number): number {
  return serverPort + 10000;
}