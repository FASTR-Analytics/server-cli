import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";

export async function handleConfigBackup(filePath: string): Promise<void> {
  const store = new ServerStore(filePath);
  
  try {
    const backupPath = await store.backup();
    console.log(colors.green(`✓ Created backup: ${backupPath}`));
  } catch (error) {
    console.error(colors.red(`Error creating backup: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}

export async function handleConfigRestore(filePath: string, backupPath: string): Promise<void> {
  const store = new ServerStore(filePath);
  
  try {
    await Deno.lstat(backupPath);
  } catch {
    console.error(colors.red(`Error: Backup file '${backupPath}' not found`));
    Deno.exit(1);
  }

  console.log(colors.yellow(`About to restore from: ${backupPath}`));
  console.log(colors.dim("This will overwrite the current servers.json file."));
  
  const response = prompt("Are you sure? (y/N): ");
  if (response?.toLowerCase() !== "y" && response?.toLowerCase() !== "yes") {
    console.log("Cancelled.");
    return;
  }

  try {
    await store.restore(backupPath);
    console.log(colors.green(`✓ Restored from backup: ${backupPath}`));
    console.log(colors.dim("A backup of the previous file was created."));
  } catch (error) {
    console.error(colors.red(`Error restoring backup: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}