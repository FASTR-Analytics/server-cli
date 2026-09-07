import { join } from "@std/path";
import { ServerStore } from "../core/server-store.ts";
import { resolveTargets } from "../core/tag-resolver.ts";
import { Server } from "../core/types.ts";
import { stopServerContainers } from "./docker/stop.ts";
import { runContainer } from "./docker/run-container.ts";
import { runCentralContainer } from "./docker/run-central-container.ts";
import { colors } from "../utils/colors.ts";

export type MoveVolumeOptions = {
  /** Print the plan and space check, change nothing. */
  dryRun?: boolean;
  /** Skip the confirmation prompt. */
  force?: boolean;
};

type MovePlan = {
  server: Server;
  oldInstanceDirPath: string;
  newInstanceDirPath: string;
  bytes: number;
};

type Fingerprint = { files: number; bytes: number };

const toGB = (b: number) => (b / 1024 ** 3).toFixed(2);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function runCommand(
  cmd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const output = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

/** true/false from `mountpoint -q`; null when the tool is not available. */
async function isMountPoint(path: string): Promise<boolean | null> {
  try {
    const result = await runCommand("mountpoint", ["-q", path]);
    return result.code === 0;
  } catch {
    return null;
  }
}

async function measureDiskUsage(path: string): Promise<number> {
  const du = await runCommand("du", ["-s", "--block-size=1", path]);
  if (du.code !== 0) {
    throw new Error(`could not measure ${path}: ${du.stderr.trim()}`);
  }
  return parseInt(du.stdout.trim().split(/\s+/)[0], 10);
}

async function availableBytes(path: string): Promise<number> {
  const df = await runCommand("df", ["--block-size=1", "--output=avail", path]);
  if (df.code !== 0) {
    throw new Error(`could not check available space on ${path}: ${df.stderr.trim()}`);
  }
  // df output: header line + value line
  return parseInt(df.stdout.trim().split("\n").pop()!.trim(), 10);
}

/**
 * Regular-file count and byte total under a directory. Filesystem-independent,
 * so it can be compared across volumes to confirm a copy is complete.
 */
async function fingerprint(dir: string): Promise<Fingerprint> {
  const find = await runCommand("find", [dir, "-type", "f", "-printf", "%s\n"]);
  if (find.code !== 0) {
    throw new Error(`could not list files in ${dir}: ${find.stderr.trim()}`);
  }
  let files = 0;
  let bytes = 0;
  for (const line of find.stdout.split("\n")) {
    if (!line) continue;
    files++;
    bytes += Number(line);
  }
  return { files, bytes };
}

async function isContainerRunning(name: string): Promise<boolean> {
  const result = await runCommand("docker", [
    "inspect",
    "--format",
    "{{.State.Running}}",
    name,
  ]);
  return result.code === 0 && result.stdout.trim() === "true";
}

async function startServer(server: Server): Promise<void> {
  if (server.mode === "central") {
    await runCentralContainer(server);
  } else {
    await runContainer(server);
  }
}

async function restartOnOldVolume(server: Server): Promise<void> {
  console.log(colors.cyan(`  Restarting '${server.id}' on its old volume...`));
  try {
    await startServer(server);
    console.log(colors.green(`  ✓ '${server.id}' is running again on its old volume`));
  } catch (error) {
    console.error(
      colors.yellow(
        `  Could not restart '${server.id}': ${errorMessage(error)}. Start it manually: wb run ${server.id}`,
      ),
    );
  }
}

/**
 * Moves one server's data: stop → verify stopped → copy → verify copy →
 * update config → start. Throws with a human-readable message on failure,
 * after restoring the server on its old volume where that is still valid.
 */
async function moveOne(
  store: ServerStore,
  plan: MovePlan,
  newVolume: string,
): Promise<void> {
  const { server } = plan;

  // 1. Stop
  console.log(colors.cyan("  Stopping..."));
  await stopServerContainers(server);

  const mustBeStopped = [
    server.id,
    `${server.id}-postgres`,
    `${server.id}-valkey`,
    ...(server.adminVersion ? [`${server.id}-admin`] : []),
  ];
  for (const name of mustBeStopped) {
    if (await isContainerRunning(name)) {
      throw new Error(
        `container '${name}' is still running; aborting to prevent data corruption. Stop it manually: docker stop ${name}`,
      );
    }
  }

  // 2. Copy
  const before = await fingerprint(plan.oldInstanceDirPath);
  console.log(
    colors.cyan(`  Copying ${before.files} files (${toGB(before.bytes)} GB)...`),
  );
  const cp = await runCommand("cp", [
    "-a",
    plan.oldInstanceDirPath,
    plan.newInstanceDirPath,
  ]);
  if (cp.code !== 0) {
    await restartOnOldVolume(server);
    throw new Error(
      `copy failed: ${cp.stderr.trim()}\n  Remove the partial copy at ${plan.newInstanceDirPath} before retrying.`,
    );
  }

  // 3. Verify copy
  const after = await fingerprint(plan.newInstanceDirPath);
  if (after.files !== before.files || after.bytes !== before.bytes) {
    await restartOnOldVolume(server);
    throw new Error(
      `copy verification failed: source has ${before.files} files / ${before.bytes} bytes, copy has ${after.files} files / ${after.bytes} bytes.\n  Remove the bad copy at ${plan.newInstanceDirPath} before retrying.`,
    );
  }
  console.log(colors.green(`  ✓ Copied and verified (${after.files} files)`));

  // 4. Update config
  await store.update(server.id, { volume: newVolume });
  const updated = await store.get(server.id);
  if (!updated) {
    throw new Error(`server '${server.id}' vanished from config after update`);
  }
  console.log(colors.green(`  ✓ Config updated (volume: ${newVolume})`));

  // 5. Start on new volume
  console.log(colors.cyan("  Starting on new volume..."));
  try {
    await startServer(updated);
  } catch (error) {
    throw new Error(
      `data moved and config updated, but start failed: ${errorMessage(error)}\n  Start it manually: wb run ${server.id}`,
    );
  }
}

function formatPlanTable(plans: MovePlan[]): string {
  const rows = plans.map((p) => [
    p.server.id,
    p.oldInstanceDirPath,
    p.newInstanceDirPath,
    `${toGB(p.bytes)} GB`,
  ]);
  const headers = ["ID", "From", "To", "Size"];
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const line = (r: string[]) =>
    "  " + r.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  return [colors.bold(line(headers)), ...rows.map((r) => line(r))].join("\n");
}

export async function handleMoveVolume(
  filePath: string,
  targets: string[],
  newVolume: string,
  mountPath: string,
  options: MoveVolumeOptions = {},
): Promise<void> {
  const store = new ServerStore(filePath);
  const newBasePath = join("/mnt", newVolume);

  let ids: string[];
  try {
    ids = await resolveTargets(store, targets);
  } catch (error) {
    console.error(colors.red(`Error: ${errorMessage(error)}`));
    Deno.exit(1);
  }

  // Verify target volume is mounted
  if (!(await pathExists(newBasePath))) {
    console.error(colors.red(`Error: Target volume not found at ${newBasePath}`));
    console.error(colors.dim("Make sure the volume is attached and mounted."));
    Deno.exit(1);
  }
  const mounted = await isMountPoint(newBasePath);
  if (mounted === false) {
    console.error(colors.red(`Error: ${newBasePath} exists but is not a mount point.`));
    console.error(
      colors.dim("Copying there would fill the root filesystem. Mount the volume first."),
    );
    Deno.exit(1);
  }
  if (mounted === null) {
    console.log(
      colors.yellow(`⚠️  Could not confirm ${newBasePath} is a mount point ('mountpoint' not available)`),
    );
  }

  // Pre-flight every server before touching anything
  const plans: MovePlan[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const problems: string[] = [];

  for (const id of ids) {
    const server = await store.get(id);
    if (!server) {
      problems.push(`${id}: not found in config`);
      continue;
    }
    if (server.volume === newVolume) {
      skipped.push({ id, reason: `already on ${newVolume}` });
      continue;
    }

    const instanceDir = server.instanceDir || server.id;
    const oldBasePath = server.volume ? join("/mnt", server.volume) : mountPath;
    const oldInstanceDirPath = join(oldBasePath, instanceDir);
    const newInstanceDirPath = join(newBasePath, instanceDir);

    if (oldInstanceDirPath === newInstanceDirPath) {
      skipped.push({
        id,
        reason: `data is already at ${newInstanceDirPath} via the default mount path; set the volume with: wb c update ${id} --volume ${newVolume}`,
      });
      continue;
    }
    if (!(await pathExists(oldInstanceDirPath))) {
      problems.push(`${id}: source data not found at ${oldInstanceDirPath}`);
      continue;
    }
    if (await pathExists(newInstanceDirPath)) {
      problems.push(
        `${id}: destination already exists at ${newInstanceDirPath} (remove or rename it first)`,
      );
      continue;
    }

    try {
      const bytes = await measureDiskUsage(oldInstanceDirPath);
      plans.push({ server, oldInstanceDirPath, newInstanceDirPath, bytes });
    } catch (error) {
      problems.push(`${id}: ${errorMessage(error)}`);
    }
  }

  // Report the plan
  console.log(colors.cyan(`Move to volume '${newVolume}' (${newBasePath})`));
  console.log("");
  if (plans.length > 0) {
    console.log(formatPlanTable(plans));
    console.log("");
  }
  if (skipped.length > 0) {
    console.log(colors.bold("Skipped:"));
    for (const s of skipped) {
      console.log(colors.dim(`  ${s.id}: ${s.reason}`));
    }
    console.log("");
  }
  if (problems.length > 0) {
    console.log(colors.bold(colors.red("Problems:")));
    for (const p of problems) {
      console.log(colors.red(`  ${p}`));
    }
    console.log("");
    console.error(colors.red("Error: Nothing was changed. Fix the problems above (or narrow the targets) and re-run."));
    Deno.exit(1);
  }
  if (plans.length === 0) {
    console.log(colors.yellow("Nothing to move."));
    return;
  }

  const totalBytes = plans.reduce((sum, p) => sum + p.bytes, 0);
  let avail: number;
  try {
    avail = await availableBytes(newBasePath);
  } catch (error) {
    console.error(colors.red(`Error: ${errorMessage(error)}`));
    Deno.exit(1);
  }
  const spaceLine = `  Total to copy: ${toGB(totalBytes)} GB  |  Available on ${newBasePath}: ${toGB(avail)} GB`;
  if (totalBytes >= avail) {
    console.log(colors.red(spaceLine));
    console.error(colors.red(`Error: Not enough space on ${newBasePath}. Nothing was changed.`));
    Deno.exit(1);
  }
  console.log(colors.dim(spaceLine));
  console.log("");

  if (options.dryRun) {
    console.log(colors.green("✓ Dry run: nothing was changed."));
    return;
  }

  if (!options.force) {
    console.log(
      colors.yellow(
        `⚠️  ${plans.length} server(s) will be moved one at a time. Each is stopped for the duration of its copy.`,
      ),
    );
    console.log(colors.cyan(`Type "yes" to proceed, or anything else to cancel:`));
    const confirmation = prompt("> ");
    if (confirmation !== "yes") {
      console.log(colors.green("✓ Move cancelled"));
      return;
    }
  }

  // Execute sequentially so only one server is down at a time
  const moved: MovePlan[] = [];
  for (const [i, plan] of plans.entries()) {
    const { server } = plan;
    console.log("");
    console.log(colors.bold(`[${i + 1}/${plans.length}] ${server.id}`));
    console.log(
      colors.dim(`  ${plan.oldInstanceDirPath} → ${plan.newInstanceDirPath}  (${toGB(plan.bytes)} GB)`),
    );
    const startedAt = Date.now();
    try {
      await moveOne(store, plan, newVolume);
    } catch (error) {
      console.error(colors.red(`✗ ${server.id}: ${errorMessage(error)}`));
      const remaining = plans.slice(i + 1);
      console.log("");
      console.log(colors.bold(colors.red(`Aborted after ${moved.length} of ${plans.length} server(s).`)));
      if (moved.length > 0) {
        console.log(colors.green(`  Moved to ${newVolume}: ${moved.map((m) => m.server.id).join(", ")}`));
      }
      if (remaining.length > 0) {
        console.log(
          colors.yellow(`  Untouched (still on old volumes, running): ${remaining.map((r) => r.server.id).join(", ")}`),
        );
      }
      console.log(colors.dim(`  Re-run the same command to continue; servers already on ${newVolume} are skipped.`));
      printCleanupHint(moved);
      Deno.exit(1);
    }
    moved.push(plan);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(colors.green(`✓ ${server.id} moved in ${seconds}s`));
  }

  console.log("");
  console.log(colors.green(`✓ Move complete: ${moved.length} server(s) now on ${newBasePath}`));
  printCleanupHint(moved);
}

function printCleanupHint(moved: MovePlan[]): void {
  if (moved.length === 0) return;
  console.log(colors.dim("  Old data still exists. Remove it once you are satisfied everything is healthy:"));
  for (const m of moved) {
    console.log(colors.dim(`    rm -rf ${m.oldInstanceDirPath}`));
  }
}
