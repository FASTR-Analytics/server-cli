import { join } from "@std/path/join";
import { getConfig } from "../../core/config.ts";
import { getPostgresPort } from "../../core/port-utils.ts";
import { SUBDIRECTORIES } from "../../core/constants.ts";
import { Server } from "../../core/types.ts";
import { colors } from "../../utils/colors.ts";
import { runAdminContainer } from "./run-admin-container.ts";
import { validateServerSetup } from "./validate-server.ts";
import { connectPgAdminToNetwork } from "./connect-pgadmin.ts";

export async function runContainer(
  serverInfo: Server,
  interactive: boolean = false,
): Promise<void> {
  const config = getConfig();
  if (!serverInfo.serverVersion) {
    throw new Error(
      `Server '${serverInfo.id}' must have a serverVersion specified`,
    );
  }

  await validateServerSetup(serverInfo, config);

  //////////////////////
  //                  //
  //    Check dirs    //
  //                  //
  //////////////////////
  const instanceDirPath = join(
    serverInfo.volume ? join("/mnt", serverInfo.volume) : config.mountPath,
    serverInfo.instanceDir || serverInfo.id,
  );
  try {
    await Deno.lstat(instanceDirPath);
  } catch {
    throw new Error("Directories not ready for this server");
  }
  for (const subDir of SUBDIRECTORIES) {
    const subDirPath = join(instanceDirPath, subDir);
    try {
      await Deno.lstat(subDirPath);
    } catch {
      console.log(colors.cyan(`Creating missing directory: ${subDir}/`));
      await Deno.mkdir(subDirPath, { recursive: true });
    }
  }

  /////////////////////////////////
  //                             //
  //    Check dir permissions    //
  //                             //
  /////////////////////////////////

  await Deno.chmod(join(instanceDirPath, "sandbox"), 0o777);

  //////////////////////////
  //                      //
  //    Create network    //
  //                      //
  //////////////////////////

  try {
    const cmdCreateNetwork = new Deno.Command("docker", {
      args: ["network", "create", serverInfo.id],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmdCreateNetwork.output();
    const stderr = new TextDecoder().decode(output.stderr);
    if (!output.success && !stderr.includes("already exists")) {
      console.log(
        colors.yellow(
          `⚠️  Warning: Could not create network: ${stderr.trim()}`,
        ),
      );
    }
  } catch {
    //
  }

  ////////////////////////
  //                    //
  //    Run Postgres    //
  //                    //
  ////////////////////////

  const cmdRemovePostgresContainer = new Deno.Command("docker", {
    args: ["container", "rm", `${serverInfo.id}-postgres`],
  });
  const chdRemovePostgresContainer = cmdRemovePostgresContainer.spawn();
  await chdRemovePostgresContainer.output();

  const postgresPort = getPostgresPort(serverInfo.port);
  const cmdRunPostgres = new Deno.Command("docker", {
    args: [
      "run",
      "-dt",
      "--name", `${serverInfo.id}-postgres`,
      "--network", serverInfo.id,
      "-p", `${postgresPort}:5432`,
      "-e", `POSTGRES_PASSWORD=${config.postgresPassword}`,
      "-e", `PGDATA=/var/lib/postgresql/data/pgdata`,
      "-v", `${join(instanceDirPath, "databases")}:/var/lib/postgresql/data`,
      "-v", `${join(instanceDirPath, "sandbox")}:/app/sandbox`,
      "postgres:17.4",
      "-c", "shared_preload_libraries=pg_stat_statements",
      "-c", "pg_stat_statements.track=all",
    ],
  });
  const chdRunPostgres = cmdRunPostgres.spawn();
  await chdRunPostgres.output();

  ////////////////////////
  //                    //
  //    Run admin       //
  //                    //
  ////////////////////////
  if (serverInfo.adminVersion) {
    await runAdminContainer(serverInfo);
  }

  ////////////////////////
  //                    //
  //    Run Valkey      //
  //                    //
  ////////////////////////
  const cmdRunValkey = new Deno.Command("docker", {
    args: [
      "run",
      "--rm",
      "-dt",
      "--name", `${serverInfo.id}-valkey`,
      "--network", serverInfo.id,
      "-v", `${join(instanceDirPath, "valkey")}:/data`,
      "valkey/valkey:8.0",
      "valkey-server",
      "--appendonly", "yes",
      "--appendfsync", "always",
    ],
  });
  const chdRunValkey = cmdRunValkey.spawn();
  const valkeyOutput = await chdRunValkey.output();
  if (!valkeyOutput.success) {
    console.log(colors.yellow(`⚠️  Warning: Valkey container failed to start — app will fall back to DB queries`));
  }

  /////////////////////////////////////
  //                                 //
  //    Remove existing container    //
  //                                 //
  /////////////////////////////////////

  const cmdRemoveContainer = new Deno.Command("docker", {
    args: ["container", "rm", serverInfo.id],
  });
  const chdRemoveContainer = cmdRemoveContainer.spawn();
  await chdRemoveContainer.output();

  /////////////////////////
  //                     //
  //    Run container    //
  //                     //
  /////////////////////////
  const port = serverInfo.port;
  const cmdRunContainer = new Deno.Command("docker", {
    args: [
      "run",
      ...(interactive ? ["-it"] : ["-dt"]),
      "--name", serverInfo.id,
      "--network", serverInfo.id,
      "-p", `${port}:8000`,
      "-v", "/var/run/docker.sock:/var/run/docker.sock",
      "-v", `${join(instanceDirPath, "databases")}:/app/databases`,
      "-v", `${join(instanceDirPath, "sandbox")}:/app/sandbox`,
      "-v", `${join(instanceDirPath, "assets")}:/app/assets`,
      "-e", `SANDBOX_DIR_PATH_EXTERNAL=${join(instanceDirPath, "sandbox")}`,
      ...(serverInfo.adminVersion
        ? ["-e", `ADMIN_SERVER_HOST=http://${serverInfo.id}-admin:8001`]
        : []),
      "-e", `SERVER_VERSION=${serverInfo.serverVersion || "latest"}`,
      ...(serverInfo.adminVersion
        ? ["-e", `ADMIN_VERSION=${serverInfo.adminVersion}`]
        : []),
      "-e", `DATABASE_FOLDER=${serverInfo.instanceDir || serverInfo.id}`,
      "-e", `CLERK_PUBLISHABLE_KEY=${config.clerkPublishableKey}`,
      "-e", `CLERK_SECRET_KEY=${config.clerkSecretKey}`,
      "-e", `INSTANCE_ID=${serverInfo.id}`,
      "-e", `INSTANCE_NAME=${serverInfo.label}`,
      ...(serverInfo.french ? ["-e", `INSTANCE_LANGUAGE=fr`] : []),
      ...(serverInfo.ethiopian ? ["-e", `INSTANCE_CALENDAR=ethiopian`] : []),
      ...(serverInfo.openAccess ? ["-e", `OPEN_ACCESS=1`] : []),
      "-e", `INSTANCE_REDIRECT_URL=https://${serverInfo.id}.${config.domain}`,
      "-e", `PG_HOST=${serverInfo.id}-postgres`,
      "-e", `PG_PORT=5432`,
      "-e", `ANTHROPIC_API_URL=${config.anthropicApiUrl}`,
      "-e", `ANTHROPIC_API_KEY=${config.anthropicApiKey}`,
      "-e", `STATUS_API_KEY=${config.statusApiKey}`,
      "-e", `SEND_GRID_API=${config.sendGridApi}`,
      "-e", `PG_PASSWORD=${config.pgPassword}`,
      "-e", `VALKEY_URL=redis://${serverInfo.id}-valkey:6379`,
      ...(config.githubToken ? ["-e", `GITHUB_TOKEN=${config.githubToken}`] : []),
      ...(config.dailyTokenLimit !== undefined ? ["-e", `DAILY_TOKEN_LIMIT=${config.dailyTokenLimit}`] : []),
      ...(config.weeklyTokenLimit !== undefined ? ["-e", `WEEKLY_TOKEN_LIMIT=${config.weeklyTokenLimit}`] : []),
      ...(serverInfo.volume ? ["-e", `VOLUME_NAME=${serverInfo.volume}`] : []),
      ...(config.centralServerSecret ? ["-e", `CENTRAL_SERVER_SECRET=${config.centralServerSecret}`] : []),
      ...(serverInfo.mode === "central" ? ["-e", `INSTANCE_MODE=central`] : []),
      serverInfo.mode === "central"
        ? getCentralServerImageName(serverInfo.serverVersion)
        : getServerImageName(serverInfo.serverVersion),
    ],
  });
  const chdRunContainer = cmdRunContainer.spawn();
  await chdRunContainer.output();

  // If pgAdmin is running, connect it to this server's network so it can
  // reach the newly started postgres container.
  await connectPgAdminToNetwork(serverInfo.id);
}

function getServerImageName(version: string): string {
  const [major, minor] = version.split(".").map(Number);
  const isOldVersion = major === 1 && minor < 6;
  const imageFamily = isOldVersion ? "wb-hmis-server" : "wb-fastr-server";
  return `timroberton/comb:${imageFamily}-v${version}`;
}

function getCentralServerImageName(version: string): string {
  return `timroberton/comb:wb-fastr-central-v${version}`;
}
