import { join } from "@std/path";
import { ServerStore } from "../core/server-store.ts";
import { colors } from "../utils/colors.ts";

export async function handleInitDirs(
  filePath: string,
  serverId: string,
  mountPath: string,
  subdirectories: string[]
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    console.error(colors.dim("Please add the server first using: wb config add <id>"));
    Deno.exit(1);
  }

  const instanceDir = server.instanceDir || server.id;
  const instanceDirPath = join(mountPath, instanceDir);
  
  console.log(colors.cyan(`Creating directories for ${serverId}...`));
  console.log(colors.dim(`Instance directory: ${instanceDirPath}`));

  try {
    await Deno.lstat(instanceDirPath);
    console.log(colors.yellow(`✓ Instance directory already exists`));
  } catch {
    await Deno.mkdir(instanceDirPath);
    console.log(colors.green(`✓ Created instance directory`));
  }

  for (const subDir of subdirectories) {
    const subDirPath = join(instanceDirPath, subDir);
    try {
      await Deno.lstat(subDirPath);
      console.log(colors.yellow(`✓ ${subDir} already exists`));
    } catch {
      await Deno.mkdir(subDirPath);
      console.log(colors.green(`✓ Created ${subDir}`));
    }
  }

  await Deno.chmod(join(instanceDirPath, "sandbox"), 0o777);
  console.log(colors.green(`✓ Set permissions for sandbox directory`));
  
  console.log(colors.green(`\n✓ Directory initialization complete for ${serverId}`));
}

export async function handleRemoveDirs(
  filePath: string,
  serverId: string,
  mountPath: string,
  force: boolean = false
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    Deno.exit(1);
  }

  const instanceDir = server.instanceDir || server.id;
  const instanceDirPath = join(mountPath, instanceDir);
  
  if (!force) {
    console.log(colors.yellow(`⚠️  WARNING: This will permanently delete all data in:`));
    console.log(colors.red(`   ${instanceDirPath}`));
    console.log(colors.yellow(`   This includes databases, exports, assets, and sandbox files.`));
    console.log("");
    console.log(colors.cyan(`Type "${serverId}" to confirm deletion, or anything else to cancel:`));
    
    const confirmation = prompt("> ");
    
    if (confirmation !== serverId) {
      console.log(colors.green("✓ Deletion cancelled"));
      Deno.exit(0);
    }
  }

  console.log(colors.cyan(`Removing directories for ${serverId}...`));
  console.log(colors.dim(`Instance directory: ${instanceDirPath}`));

  try {
    await Deno.remove(instanceDirPath, { recursive: true });
    console.log(colors.green(`✓ Removed instance directory and all contents`));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(colors.yellow(`Directory does not exist: ${instanceDirPath}`));
    } else {
      console.error(colors.red(`Error removing directory: ${error instanceof Error ? error.message : String(error)}`));
      Deno.exit(1);
    }
  }
}