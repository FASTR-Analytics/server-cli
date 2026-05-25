import { join } from "@std/path/join";
import { getConfig } from "../../core/config.ts";
import { getPostgresPort } from "../../core/port-utils.ts";
import { Server } from "../../core/types.ts";
import { colors } from "../../utils/colors.ts";
import { validateServerSetup } from "./validate-server.ts";
import { connectPgAdminToNetwork } from "./connect-pgadmin.ts";

const CENTRAL_SUBDIRECTORIES = ["databases", "assets"];

export async function runCentralContainer(
  serverInfo: Server,
  interactive: boolean = false,
): Promise<void> {
  if (serverInfo.mode !== "central") {
    throw new Error(
      `Server '${serverInfo.id}' is not a central server. Use 'wb run' instead.`,
    );
  }

  const config = getConfig();
  if (!serverInfo.serverVersion) {
    throw new Error(
      `Server '${serverInfo.id}' must have a serverVersion specified`,
    );
  }

  await validateServerSetup(serverInfo, config);

  const instanceDirPath = join(
    serverInfo.volume ? join("/mnt", serverInfo.volume) : config.mountPath,
    serverInfo.instanceDir || serverInfo.id,
  );
  try {
    await Deno.lstat(instanceDirPath);
  } catch {
    throw new Error("Directories not ready for this server");
  }
  for (const subDir of CENTRAL_SUBDIRECTORIES) {
    const subDirPath = join(instanceDirPath, subDir);
    try {
      await Deno.lstat(subDirPath);
    } catch {
      console.log(colors.cyan(`Creating missing directory: ${subDir}/`));
      await Deno.mkdir(subDirPath, { recursive: true });
    }
  }

  try {
    const cmdCreateNetwork = new Deno.Command("docker", {
      args: ["network", "create", serverInfo.id],
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmdCreateNetwork.output();
    const stderr = new TextDecoder().decode(output.stderr);
    if (!output.success && !stderr.includes("already exists")) {
      console.log(colors.yellow(`⚠️  Warning: Could not create network: ${stderr.trim()}`));
    }
  } catch {
    //
  }

  const cmdStopPostgresContainer = new Deno.Command("docker", {
    args: ["container", "stop", `${serverInfo.id}-postgres`],
    stdout: "null", stderr: "null",
  });
  await cmdStopPostgresContainer.output();
  const cmdRemovePostgresContainer = new Deno.Command("docker", {
    args: ["container", "rm", `${serverInfo.id}-postgres`],
    stdout: "null", stderr: "null",
  });
  await cmdRemovePostgresContainer.output();

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
      "postgres:17.4",
      "-c", "shared_preload_libraries=pg_stat_statements",
      "-c", "pg_stat_statements.track=all",
    ],
  });
  const chdRunPostgres = cmdRunPostgres.spawn();
  await chdRunPostgres.output();

  const cmdStopContainer = new Deno.Command("docker", {
    args: ["container", "stop", serverInfo.id],
    stdout: "null", stderr: "null",
  });
  await cmdStopContainer.output();
  const cmdRemoveContainer = new Deno.Command("docker", {
    args: ["container", "rm", serverInfo.id],
    stdout: "null", stderr: "null",
  });
  await cmdRemoveContainer.output();

  const port = serverInfo.port;
  const cmdRunContainer = new Deno.Command("docker", {
    args: [
      "run",
      ...(interactive ? ["-it"] : ["-dt"]),
      "--name", serverInfo.id,
      "--network", serverInfo.id,
      "-p", `${port}:8000`,
      "-v", `${join(instanceDirPath, "databases")}:/app/databases`,
      "-v", `${join(instanceDirPath, "assets")}:/app/assets`,
      "-e", `SERVER_VERSION=${serverInfo.serverVersion}`,
      "-e", `DATABASE_FOLDER=${serverInfo.instanceDir || serverInfo.id}`,
      "-e", `CLERK_PUBLISHABLE_KEY=${config.clerkPublishableKey}`,
      "-e", `CLERK_SECRET_KEY=${config.clerkSecretKey}`,
      "-e", `INSTANCE_ID=${serverInfo.id}`,
      "-e", `INSTANCE_NAME=${serverInfo.label}`,
      "-e", `INSTANCE_MODE=central`,
      "-e", `INSTANCE_REDIRECT_URL=https://${serverInfo.id}.${config.domain}`,
      "-e", `PG_HOST=${serverInfo.id}-postgres`,
      "-e", `PG_PORT=5432`,
      "-e", `PG_PASSWORD=${config.pgPassword}`,
      "-e", `STATUS_API_KEY=${config.statusApiKey}`,
      ...(serverInfo.volume ? ["-e", `VOLUME_NAME=${serverInfo.volume}`] : []),
      getCentralServerImageName(serverInfo.serverVersion),
    ],
  });
  const chdRunContainer = cmdRunContainer.spawn();
  await chdRunContainer.output();

  await connectPgAdminToNetwork(serverInfo.id);
}

function getCentralServerImageName(version: string): string {
  return `timroberton/comb:wb-fastr-central-v${version}`;
}
