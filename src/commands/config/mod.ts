import { parseArgs } from "@std/cli";
import { handleConfigList } from "./list.ts";
import { handleConfigShow } from "./show.ts";
import { handleConfigAdd } from "./add.ts";
import { handleConfigUpdate } from "./update.ts";
import { handleConfigRemove } from "./remove.ts";
import { handleConfigValidate } from "./validate.ts";
import { handleConfigBackup, handleConfigRestore } from "./backup.ts";
import { handleConfigTag, handleConfigUntag } from "./tag.ts";
import { colors } from "../../utils/colors.ts";

type UpdateOptions = {
  label?: string;
  french?: boolean;
  ethiopian?: boolean;
  "open-access"?: boolean;
  server?: string;
  admin?: string;
  "instance-dir"?: string;
};

function parseBooleanOption(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  throw new Error(`Invalid boolean value: ${value}. Use true/false, yes/no, or 1/0.`);
}

export async function handleConfig(
  filePath: string,
  subcommand: string,
  args: string[]
): Promise<void> {
  const parsed = parseArgs(args, {
    boolean: ["json", "force"],
    string: ["label", "french", "ethiopian", "open-access", "server", "admin", "instance-dir", "tag"],
    alias: {
      "open-access": "open_access",
      "instance-dir": "instance_dir"
    }
  });

  switch (subcommand) {
    case "list":
      await handleConfigList(filePath, { json: parsed.json, tag: parsed.tag });
      break;

    case "show": {
      const id = parsed._[0] as string;
      if (!id) {
        console.error(colors.red("Error: Server ID required"));
        console.error(colors.dim("Usage: wb config show <id>"));
        Deno.exit(1);
      }
      await handleConfigShow(filePath, id, { json: parsed.json });
      break;
    }

    case "add": {
      const id = parsed._[0] as string;
      if (!id) {
        console.error(colors.red("Error: Server ID required"));
        console.error(colors.dim("Usage: wb config add <id>"));
        Deno.exit(1);
      }
      await handleConfigAdd(filePath, id);
      break;
    }

    case "update": {
      // Validate known options
      const knownOptions = new Set(["_", "json", "force", "label", "french", "ethiopian", "open-access", "open_access", "server", "admin", "instance-dir", "instance_dir"]);
      const providedOptions = Object.keys(parsed);
      const unknownOptions = providedOptions.filter(opt => !knownOptions.has(opt));

      if (unknownOptions.length > 0) {
        console.error(colors.red(`Error: Unknown option(s): --${unknownOptions.join(", --")}`));
        console.error(colors.dim("Valid options: --label, --french, --ethiopian, --open-access, --server, --admin, --instance-dir"));
        Deno.exit(1);
      }

      const targets = parsed._ as string[];
      
      const options: UpdateOptions = {};

      if (parsed.label) options.label = parsed.label;
      if (parsed.french) options.french = parseBooleanOption(parsed.french);
      if (parsed.ethiopian) options.ethiopian = parseBooleanOption(parsed.ethiopian);
      if (parsed["open-access"]) options["open-access"] = parseBooleanOption(parsed["open-access"]);
      if (parsed.server) options.server = parsed.server;
      if (parsed.admin) options.admin = parsed.admin;
      if (parsed["instance-dir"]) options["instance-dir"] = parsed["instance-dir"];

      await handleConfigUpdate(filePath, targets, options);
      break;
    }

    case "remove": {
      const target = parsed._[0] as string;
      if (!target) {
        console.error(colors.red("Error: Server ID or tag required"));
        console.error(colors.dim("Usage: wb config remove <id|@tag|server=VERSION>"));
        Deno.exit(1);
      }
      await handleConfigRemove(filePath, target, { force: parsed.force });
      break;
    }

    case "validate":
      await handleConfigValidate(filePath);
      break;

    case "backup":
      await handleConfigBackup(filePath);
      break;

    case "restore": {
      const backupPath = parsed._[0] as string;
      if (!backupPath) {
        console.error(colors.red("Error: Backup file path required"));
        console.error(colors.dim("Usage: wb config restore <backup-file>"));
        Deno.exit(1);
      }
      await handleConfigRestore(filePath, backupPath);
      break;
    }

    case "tag": {
      const [id, ...tags] = parsed._ as string[];
      if (!id) {
        console.error(colors.red("Error: Server ID required"));
        console.error(colors.dim("Usage: wb config tag <id> <tag1> [tag2 ...]"));
        Deno.exit(1);
      }
      await handleConfigTag(filePath, id, tags);
      break;
    }

    case "untag": {
      const [id, ...tags] = parsed._ as string[];
      if (!id) {
        console.error(colors.red("Error: Server ID required"));
        console.error(colors.dim("Usage: wb config untag <id> <tag1> [tag2 ...]"));
        Deno.exit(1);
      }
      await handleConfigUntag(filePath, id, tags);
      break;
    }

    default:
      console.error(colors.red(`Error: Unknown config subcommand '${subcommand}'`));
      console.error(colors.dim("Available: list, show, add, update, remove, validate, backup, restore, tag, untag"));
      Deno.exit(1);
  }
}