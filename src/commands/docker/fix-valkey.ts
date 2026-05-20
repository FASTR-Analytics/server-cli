import { join } from "@std/path/join";
import { getConfig } from "../../core/config.ts";
import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";

export async function handleFixValkey(serverId: string): Promise<void> {
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

  console.log(colors.cyan(`Fixing corrupted AOF for '${serverId}'...`));
  console.log(colors.dim(`Data path: ${valkeyDataPath}`));
  console.log(colors.yellow("⚠️  This will truncate data after the corruption point.\n"));

  const cmd = new Deno.Command("docker", {
    args: [
      "run",
      "--rm",
      "-it",
      "-v", `${valkeyDataPath}:/data`,
      "valkey/valkey:8.0",
      "valkey-check-aof",
      "--fix",
      "/data/appendonlydir/appendonly.aof.manifest",
    ],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const child = cmd.spawn();
  const status = await child.output();

  if (status.success) {
    console.log(colors.green("\n✓ AOF fixed. Run 'wb restart " + serverId + "' to bring the server back up."));
  } else {
    console.error(colors.red("\nFix failed. Check the output above for details."));
    Deno.exit(1);
  }
}
