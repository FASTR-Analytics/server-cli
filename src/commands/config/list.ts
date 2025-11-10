import { ServerStore } from "../../core/server-store.ts";
import { formatServersTable } from "../../utils/table.ts";
import { getRunningContainers } from "../../utils/docker-status.ts";

export async function handleConfigList(
  filePath: string,
  options: { json?: boolean; tag?: string }
): Promise<void> {
  const store = new ServerStore(filePath);
  let servers = await store.read();

  if (options.tag) {
    servers = await store.getByTag(options.tag);
  }

  // Sort servers by ID alphabetically
  const sortedServers = [...servers].sort((a, b) => a.id.localeCompare(b.id));

  if (options.json) {
    console.log(JSON.stringify(sortedServers, null, 2));
  } else {
    const runningContainers = await getRunningContainers();
    console.log(formatServersTable(sortedServers, runningContainers));
  }
}