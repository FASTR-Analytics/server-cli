import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";
import { resolveTargets } from "../../core/tag-resolver.ts";

export async function handleConfigRemove(
  filePath: string,
  target: string,
  options: { force?: boolean }
): Promise<void> {
  const store = new ServerStore(filePath);

  try {
    const resolvedIds = await resolveTargets(store, [target]);

    if (!options.force) {
      const servers = await Promise.all(resolvedIds.map(id => store.get(id)));
      const validServers = servers.filter(s => s !== null);

      console.log(colors.yellow(`About to remove ${resolvedIds.length} server(s):`));
      for (const server of validServers) {
        console.log(colors.dim(`  ${server!.id} (${server!.label}, port ${server!.port})`));
      }
      console.log(colors.dim("This will only remove the configuration. Any running containers will continue to run."));

      const response = prompt("Are you sure? (y/N): ");
      if (response?.toLowerCase() !== "y" && response?.toLowerCase() !== "yes") {
        console.log("Cancelled.");
        return;
      }
    }

    for (const id of resolvedIds) {
      await store.remove(id);
      console.log(colors.green(`✓ Removed server '${id}'`));
    }

    console.log(colors.dim("Note: Any running containers for these servers are still running."));
    console.log(colors.dim(`Use 'wb stop ${resolvedIds.join(" ")}' to stop the containers if needed.`));
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}