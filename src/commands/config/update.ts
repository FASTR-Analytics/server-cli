import { ServerStore } from "../../core/server-store.ts";
import { Server } from "../../core/types.ts";
import { colors } from "../../utils/colors.ts";
import { resolveTargets } from "../../core/tag-resolver.ts";

type UpdateOptions = {
  label?: string;
  french?: boolean;
  ethiopian?: boolean;
  "open-access"?: boolean;
  server?: string;
  admin?: string;
  "instance-dir"?: string;
};

async function updateSingleServer(
  store: ServerStore,
  id: string,
  options: UpdateOptions
): Promise<void> {
  const existing = await store.get(id);

  if (!existing) {
    console.error(colors.red(`Error: Server '${id}' not found`));
    return;
  }

  const changes: Partial<Server> = {};
  const changesList: string[] = [];

  if (options.label !== undefined) {
    changes.label = options.label;
    changesList.push(`label: "${options.label}"`);
  }

  if (options.french !== undefined) {
    changes.french = options.french;
    changesList.push(`french: ${options.french}`);
  }

  if (options.ethiopian !== undefined) {
    changes.ethiopian = options.ethiopian;
    changesList.push(`ethiopian: ${options.ethiopian}`);
  }

  if (options["open-access"] !== undefined) {
    changes.openAccess = options["open-access"];
    changesList.push(`open-access: ${options["open-access"]}`);
  }

  if (options.server !== undefined) {
    changes.serverVersion = options.server;
    changesList.push(`server: ${options.server}`);
  }

  if (options.admin !== undefined) {
    // Allow removing admin version by setting it to empty string or "none"
    if (options.admin === "" || options.admin.toLowerCase() === "none") {
      changes.adminVersion = undefined;
      changesList.push(`admin: None (removed)`);
    } else {
      changes.adminVersion = options.admin;
      changesList.push(`admin: ${options.admin}`);
    }
  }

  if (options["instance-dir"] !== undefined) {
    changes.instanceDir = options["instance-dir"];
    changesList.push(`instance-dir: ${options["instance-dir"]}`);
  }


  if (changesList.length === 0) {
    console.log(colors.yellow(`No changes specified for server '${id}'`));
    return;
  }

  try {
    await store.update(id, changes);
    console.log(colors.green(`✓ Updated server '${id}':`));
    for (const change of changesList) {
      console.log(colors.dim(`  ${change}`));
    }
  } catch (error) {
    console.error(colors.red(`Error updating '${id}': ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function handleConfigUpdate(
  filePath: string,
  targets: string[],
  options: UpdateOptions
): Promise<void> {
  const store = new ServerStore(filePath);

  if (targets.length === 0) {
    console.error(colors.red("Error: Server ID(s) or tag(s) required"));
    console.error(colors.dim("Usage: wb config update <id1> [id2 ...] | @tag | server=VERSION | all [options]"));
    Deno.exit(1);
  }

  if (Object.keys(options).length === 0) {
    console.error(colors.yellow("No changes specified. Use --help to see available options."));
    Deno.exit(1);
  }

  try {
    const resolvedIds = await resolveTargets(store, targets);
    for (const id of resolvedIds) {
      await updateSingleServer(store, id, options);
    }
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}