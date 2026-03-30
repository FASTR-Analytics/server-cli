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

  // Check available space on target volume before stopping anything
  const duCmd = new Deno.Command("du", {
    args: ["-s", "--block-size=1", oldInstanceDirPath],
    stdout: "piped",
    stderr: "piped",
  });
  const duResult = await duCmd.output();
  if (duResult.code !== 0) {
    console.error(colors.red(`Error: Could not measure source directory size.`));
    Deno.exit(1);
  }
  const sourceBytes = parseInt(new TextDecoder().decode(duResult.stdout).trim().split(/\s+/)[0], 10);

  const dfCmd = new Deno.Command("df", {
    args: ["--block-size=1", "--output=avail", newBasePath],
    stdout: "piped",
    stderr: "piped",
  });
  const dfResult = await dfCmd.output();
  if (dfResult.code !== 0) {
    console.error(colors.red(`Error: Could not check available space on ${newBasePath}.`));
    Deno.exit(1);
  }
  // df output: header line + value line
  const availBytes = parseInt(new TextDecoder().decode(dfResult.stdout).trim().split("\n").pop()!.trim(), 10);

  const toGB = (b: number) => (b / 1024 ** 3).toFixed(2);

  if (sourceBytes >= availBytes) {
    console.error(colors.red(`Error: Not enough space on ${newBasePath}.`));
    console.error(colors.dim(`  Required:  ${toGB(sourceBytes)} GB`));
    console.error(colors.dim(`  Available: ${toGB(availBytes)} GB`));
    Deno.exit(1);
  }

  console.log(colors.cyan(`Moving '${serverId}' from ${oldBasePath} → ${newBasePath}`));
  console.log(colors.dim(`  Source:      ${oldInstanceDirPath}`));
  console.log(colors.dim(`  Destination: ${newInstanceDirPath}`));
  console.log(colors.dim(`  Data size:   ${toGB(sourceBytes)} GB  |  Space available: ${toGB(availBytes)} GB`));
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
