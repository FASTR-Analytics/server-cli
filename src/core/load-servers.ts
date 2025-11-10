import { Server } from "./types.ts";

export async function loadServersFile(
  serversFilePath: string
): Promise<Server[]> {
  try {
    const serversStr = await Deno.readTextFile(serversFilePath);
    return JSON.parse(serversStr);
  } catch {
    return [];
  }
}
