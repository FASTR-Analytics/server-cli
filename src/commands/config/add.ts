import { ServerStore } from "../../core/server-store.ts";
import { Server } from "../../core/types.ts";
import { allocatePort } from "../../core/port-utils.ts";
import { colors } from "../../utils/colors.ts";
import { sortVersions } from "../../utils/version.ts";

export async function handleConfigAdd(
  filePath: string,
  id: string
): Promise<void> {
  if (!id || id.trim().length === 0) {
    console.error(colors.red("Error: Server ID is required"));
    console.error(colors.dim("Example: wb config add nigeria"));
    Deno.exit(1);
  }

  id = id.trim();

  const label = id
    .replaceAll("-", " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const store = new ServerStore(filePath);
  
  // Get existing servers to find latest versions
  const existingServers = await store.read();
  
  // Find latest server version (sort semantically, descending)
  const serverVersions = sortVersions(
    existingServers.map(s => s.serverVersion).filter(v => v),
    true
  );
  const latestServerVersion = serverVersions[0] || "1.0.0";

  // Allocate port for new server
  const port = allocatePort(existingServers);

  const server: Server = {
    id,
    label,
    port,
    serverVersion: latestServerVersion,
    french: false,
    ethiopian: false,
    openAccess: false,
  };

  try {
    await store.add(server);
    console.log(colors.green(`✓ Added server '${id}' on port ${port}`));
    console.log(colors.dim(`  Label: ${label}`));
    console.log(colors.dim(`  Server version: ${latestServerVersion}`));
    console.log(colors.dim(`  Admin version: None`));
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}