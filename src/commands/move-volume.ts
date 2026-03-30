import { join } from "@std/path";
import { ServerStore } from "../core/server-store.ts";
import { handleStop } from "./docker/stop.ts";
import { handleRun } from "./docker/run.ts";
import { colors } from "../utils/colors.ts";

export async function handleMoveVolume(
  filePath: string,
  serverId: string,
  newVolume: string,
  mountPath: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    Deno.exit(1);
  }

  const instanceDir = server.instanceDir || server.id;
  const oldBasePath = server.volume ? join("/mnt", server.volume) : mountPath;
  const newBasePath = join("/mnt", newVolume);
  const oldInstanceDirPath = join(oldBasePath, instanceDir);
  const newInstanceDirPath = join(newBasePath, instanceDir);

  if (server.volume === newVolume) {
    console.log(colors.yellow(`Server '${serverId}' is already on volume: ${newVolume}`));
    return;
  }

  // Verify target volume is mounted
  try {
    await Deno.lstat(newBasePath);
  } catch {
    console.error(colors.red(`Error: Target volume not found at ${newBasePath}`));
    console.error(colors.dim("Make sure the volume is attached and mounted."));
    Deno.exit(1);
  }

  // Verify source data exists
  try {
    await Deno.lstat(oldInstanceDirPath);
  } catch {
    console.error(colors.red(`Error: Source data not found at ${oldInstanceDirPath}`));
    Deno.exit(1);
  }

  // Check destination doesn't already exist
  try {
    await Deno.lstat(newInstanceDirPath);
    console.error(colors.red(`Error: Destination already exists at ${newInstanceDirPath}`));
    console.error(colors.dim("Remove or rename it before moving."));
    Deno.exit(1);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  console.log(colors.cyan(`Moving '${serverId}' from ${oldBasePath} → ${newBasePath}`));
  console.log(colors.dim(`  Source:      ${oldInstanceDirPath}`));
  console.log(colors.dim(`  Destination: ${newInstanceDirPath}`));
  console.log("");

  // 1. Stop server
  console.log(colors.cyan("Stopping server..."));
  await handleStop([serverId]);
  console.log(colors.green("✓ Server stopped"));

  // Verify postgres container is actually stopped before copying
  const checkCmd = new Deno.Command("docker", {
    args: ["inspect", "--format", "{{.State.Running}}", `${serverId}-postgres`],
    stdout: "piped",
    stderr: "piped",
  });
  const checkResult = await checkCmd.output();
  const isRunning = new TextDecoder().decode(checkResult.stdout).trim();
  if (isRunning === "true") {
    console.error(colors.red("Error: PostgreSQL container is still running. Aborting to prevent data corruption."));
    console.error(colors.dim(`Stop it manually: docker stop ${serverId}-postgres`));
    Deno.exit(1);
  }

  // 2. Copy data
  console.log(colors.cyan("Copying data to new volume..."));
  const copyCmd = new Deno.Command("cp", {
    args: ["-rp", oldInstanceDirPath, newBasePath],
    stdout: "piped",
    stderr: "piped",
  });
  const copyResult = await copyCmd.output();
  if (copyResult.code !== 0) {
    const stderr = new TextDecoder().decode(copyResult.stderr);
    console.error(colors.red(`Error copying data: ${stderr}`));
    console.error(colors.yellow("The server was stopped but data was NOT moved. Restart manually: wb run " + serverId));
    Deno.exit(1);
  }
  console.log(colors.green("✓ Data copied"));

  // 3. Update config
  console.log(colors.cyan("Updating server config..."));
  await store.update(serverId, { volume: newVolume });
  console.log(colors.green(`✓ Config updated (volume: ${newVolume})`));

  // 4. Start server
  console.log(colors.cyan("Starting server on new volume..."));
  await handleRun([serverId]);
  console.log(colors.green("✓ Server started"));

  console.log("");
  console.log(colors.green(`✓ Move complete: '${serverId}' is now on ${newBasePath}`));
  console.log(colors.dim(`  Old data still exists at ${oldInstanceDirPath} — remove it manually when ready.`));
}
