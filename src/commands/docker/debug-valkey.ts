import { join } from "@std/path/join";
import { getConfig } from "../../core/config.ts";
import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";

export async function handleDebugValkey(serverId: string): Promise<void> {
  const config = getConfig();
  const store = new ServerStore(config.serversFilePath);

  const serverInfo = await store.get(serverId);
  if (!serverInfo) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    Deno.exit(1);
  }

  const instanceDirPath = join(
    serverInfo.volume ? join("/mnt", serverInfo.volume) : config.mountPath,
    serverInfo.instanceDir || serverInfo.id,
  );
  const valkeyDataPath = join(instanceDirPath, "valkey");

  console.log(colors.cyan(`Running valkey in foreground for '${serverId}'...`));
  console.log(colors.dim(`Data path: ${valkeyDataPath}`));
  console.log(colors.dim("Press Ctrl+C to stop\n"));

  const cmd = new Deno.Command("docker", {
    args: [
      "run",
      "--rm",
      "-it",
      "--name", `${serverInfo.id}-valkey-debug`,
      "--network", serverInfo.id,
      "-v", `${valkeyDataPath}:/data`,
      "valkey/valkey:8.0",
      "valkey-server",
      "--appendonly", "yes",
    ],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const child = cmd.spawn();
  await child.output();
}
