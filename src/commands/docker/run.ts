import { getConfig } from "../../core/config.ts";
import { ServerStore } from "../../core/server-store.ts";
import { resolveTargets } from "../../core/tag-resolver.ts";
import { runContainer } from "./run-container.ts";
import { colors } from "../../utils/colors.ts";

export async function handleRun(targets: string[], interactive: boolean = false): Promise<void> {
  const config = getConfig();
  const store = new ServerStore(config.serversFilePath);

  if (targets.length === 0) {
    console.error(colors.red("Error: Server ID(s) required"));
    console.error(colors.dim("Usage: wb run <id1> [id2 ...] | @tag | server=VERSION | all"));
    Deno.exit(1);
  }

  try {
    const resolvedIds = await resolveTargets(store, targets);

    for (const id of resolvedIds) {
      const serverInfo = await store.get(id);
      if (!serverInfo) {
        console.error(colors.red(`Error: Server '${id}' not found`));
        continue;
      }
      console.log("Run container:", serverInfo.id, String(serverInfo.port));
      await runContainer(serverInfo, interactive);
    }
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}