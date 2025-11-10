import { parseArgs } from "@std/cli";
import { getConfig } from "./config.ts";
import { SUBDIRECTORIES } from "./constants.ts";
import { handleConfig } from "../commands/config/mod.ts";
import { handleInitDirs, handleRemoveDirs } from "../commands/dirs.ts";
import { handleInitNginx, handleRemoveNginx } from "../commands/nginx.ts";
import { handleInitSsl, handleRemoveSsl } from "../commands/ssl.ts";
import { handleListSsl, handleListNginx } from "../commands/list.ts";
import { handlePull } from "../commands/docker/pull.ts";
import { handleStop } from "../commands/docker/stop.ts";
import { handleRun } from "../commands/docker/run.ts";
import { handleRestart } from "../commands/docker/restart.ts";
import { handlePrune } from "../commands/docker/prune.ts";
import { showHelp } from "../utils/help.ts";
import { colors } from "../utils/colors.ts";

export async function runCLI(): Promise<void> {
  const config = getConfig();
  
  // For config commands, we need to parse arguments differently
  // so we don't consume flags that belong to subcommands
  const rawArgs = Deno.args;
  const [command, subcommand, ...rest] = rawArgs;

  // Parse top-level args only for non-config commands
  const needsArgParsing =
    command !== "config" &&
    command !== "c" &&
    command !== "init-dirs" &&
    command !== "remove-dirs" &&
    command !== "init-nginx" &&
    command !== "remove-nginx" &&
    command !== "init-ssl" &&
    command !== "remove-ssl" &&
    command !== "list-ssl" &&
    command !== "list-nginx";
  const args = needsArgParsing
    ? parseArgs(Deno.args, {
        boolean: ["pull", "interactive", "help", "force"],
        alias: {
          help: "h",
          force: "f",
        },
      })
    : {
        _: rawArgs,
        help: rawArgs.includes("--help") || rawArgs.includes("-h"),
        force: rawArgs.includes("--force") || rawArgs.includes("-f"),
        pull: false,
        interactive: rawArgs.includes("--interactive"),
      };

  // Handle help
  if (args.help || command === "help") {
    showHelp();
    Deno.exit(0);
  }

  // Handle config commands (with 'c' alias)
  if (command === "config" || command === "c") {
    if (!subcommand) {
      console.error(colors.red("Error: Config subcommand required"));
      console.error(
        colors.dim(
          "Usage: wb config <list|show|add|update|remove|validate|backup|restore|tag|untag>"
        )
      );
      Deno.exit(1);
    }
    await handleConfig(config.serversFilePath, subcommand as string, rest);
    Deno.exit(0);
  }

  // Handle init-dirs command
  if (command === "init-dirs") {
    const serverId = subcommand;
    if (!serverId) {
      console.error(colors.red("Error: Server ID required"));
      console.error(colors.dim("Usage: wb init-dirs <server-id>"));
      Deno.exit(1);
    }
    await handleInitDirs(
      config.serversFilePath,
      serverId,
      config.mountPath,
      SUBDIRECTORIES
    );
    Deno.exit(0);
  }

  // Handle remove-dirs command
  if (command === "remove-dirs") {
    const serverId = subcommand;
    if (!serverId) {
      console.error(colors.red("Error: Server ID required"));
      console.error(colors.dim("Usage: wb remove-dirs <server-id> [--force]"));
      Deno.exit(1);
    }
    const force = rawArgs.includes("--force") || rawArgs.includes("-f");
    await handleRemoveDirs(config.serversFilePath, serverId, config.mountPath, force);
    Deno.exit(0);
  }

  // Handle init-nginx command
  if (command === "init-nginx") {
    const serverId = subcommand;
    if (!serverId) {
      console.error(colors.red("Error: Server ID required"));
      console.error(colors.dim("Usage: wb init-nginx <server-id>"));
      Deno.exit(1);
    }
    await handleInitNginx(
      config.serversFilePath,
      serverId,
      config.domain,
      config.sitesAvailablePath,
      config.sitesEnabledPath
    );
    Deno.exit(0);
  }

  // Handle remove-nginx command
  if (command === "remove-nginx") {
    const serverId = subcommand;
    if (!serverId) {
      console.error(colors.red("Error: Server ID required"));
      console.error(colors.dim("Usage: wb remove-nginx <server-id>"));
      Deno.exit(1);
    }
    await handleRemoveNginx(
      config.serversFilePath,
      serverId,
      config.domain,
      config.sitesAvailablePath,
      config.sitesEnabledPath
    );
    Deno.exit(0);
  }

  // Handle init-ssl command
  if (command === "init-ssl") {
    const serverId = subcommand;
    if (!serverId) {
      console.error(colors.red("Error: Server ID required"));
      console.error(colors.dim("Usage: wb init-ssl <server-id>"));
      Deno.exit(1);
    }
    await handleInitSsl(config.serversFilePath, serverId, config.domain);
    Deno.exit(0);
  }

  // Handle remove-ssl command
  if (command === "remove-ssl") {
    const serverId = subcommand;
    if (!serverId) {
      console.error(colors.red("Error: Server ID required"));
      console.error(colors.dim("Usage: wb remove-ssl <server-id>"));
      Deno.exit(1);
    }
    await handleRemoveSsl(config.serversFilePath, serverId, config.domain);
    Deno.exit(0);
  }

  // Handle list-ssl command
  if (command === "list-ssl") {
    await handleListSsl();
    Deno.exit(0);
  }

  // Handle list-nginx command
  if (command === "list-nginx") {
    await handleListNginx(config.sitesAvailablePath, config.sitesEnabledPath, config.domain);
    Deno.exit(0);
  }

  // Handle pull command
  if (args.pull || command === "pull") {
    await handlePull();
    Deno.exit(0);
  }

  // Handle prune command
  if (command === "prune") {
    await handlePrune();
    Deno.exit(0);
  }

  // Handle stop command
  if (command === "stop") {
    const targets = rest;
    if (subcommand) targets.unshift(subcommand);
    await handleStop(targets);
    Deno.exit(0);
  }

  // Handle run command (with 'start' alias)
  if (command === "run" || command === "start") {
    const targets = rest;
    if (subcommand) targets.unshift(subcommand);
    await handleRun(targets, args.interactive);
    Deno.exit(0);
  }

  // Handle restart command
  if (command === "restart") {
    const targets = rest;
    if (subcommand) targets.unshift(subcommand);
    await handleRestart(targets, args.interactive);
    Deno.exit(0);
  }

  // If no command matched, show help
  showHelp();
}