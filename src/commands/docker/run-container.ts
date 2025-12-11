import { join } from "@std/path/join";
import { getConfig } from "../../core/config.ts";
import { getPostgresPort } from "../../core/port-utils.ts";
import { SUBDIRECTORIES } from "../../core/constants.ts";
import { Server } from "../../core/types.ts";
import { colors } from "../../utils/colors.ts";
import { extractPortFromNginxFile } from "../../utils/nginx-parser.ts";
import { runAdminContainer } from "./run-admin-container.ts";

import { Config } from "../../core/config.ts";

async function validateServerSetup(
  serverInfo: Server,
  config: Config
): Promise<void> {
  const subdomain = `${serverInfo.id}.${config.domain}`;
  const port = serverInfo.port;

  console.log(colors.cyan("Validating server setup..."));

  // Check nginx configuration exists and matches port
  const nginxConfigPath = `${config.sitesAvailablePath}/${subdomain}`;
  try {
    const nginxPort = await extractPortFromNginxFile(nginxConfigPath);

    if (nginxPort !== null) {
      if (nginxPort === port) {
        console.log(colors.green(`✓ Nginx configuration matches port ${port}`));
      } else {
        console.log(
          colors.red(
            `✗ Nginx port mismatch: config has ${nginxPort}, server uses ${port}`
          )
        );
        console.log(
          colors.dim(`   Run: wb nginx ${serverInfo.id} to fix configuration`)
        );
        throw new Error(
          `Nginx configuration port mismatch for ${serverInfo.id}`
        );
      }
    } else {
      console.log(
        colors.yellow(`⚠️  Warning: Cannot parse port from nginx config`)
      );
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(
        colors.yellow(
          `⚠️  Warning: No nginx configuration found for ${subdomain}`
        )
      );
      console.log(
        colors.dim(`   Run: wb nginx ${serverInfo.id} to create one`)
      );
    } else if (
      error instanceof Error &&
      error.message?.includes("port mismatch")
    ) {
      throw error; // Re-throw port mismatch errors to stop container startup
    } else {
      console.log(
        colors.yellow(`⚠️  Warning: Cannot check nginx configuration`)
      );
    }
  }

  // Check SSL certificate exists
  try {
    const certCmd = new Deno.Command("certbot", {
      args: ["certificates"],
      stdout: "piped",
      stderr: "piped",
    });
    const certResult = await certCmd.output();

    if (certResult.success) {
      const output = new TextDecoder().decode(certResult.stdout);
      if (!output.includes(`Certificate Name: ${subdomain}`)) {
        console.log(
          colors.yellow(
            `⚠️  Warning: No SSL certificate found for ${subdomain}`
          )
        );
        console.log(
          colors.dim(`   Run: wb ssl-init ${serverInfo.id} to create one`)
        );
      } else {
        console.log(colors.green(`✓ SSL certificate found for ${subdomain}`));
      }
    } else {
      console.log(
        colors.yellow(
          `⚠️  Warning: Cannot check SSL certificates (certbot not available)`
        )
      );
    }
  } catch {
    console.log(
      colors.yellow(
        `⚠️  Warning: Cannot check SSL certificates (certbot not available)`
      )
    );
  }

  // Check nginx is enabled
  const nginxEnabledPath = join(config.sitesEnabledPath, subdomain);
  try {
    await Deno.lstat(nginxEnabledPath);
    console.log(colors.green(`✓ Nginx site enabled for ${subdomain}`));
  } catch {
    console.log(
      colors.yellow(`⚠️  Warning: Nginx site not enabled for ${subdomain}`)
    );
    console.log(
      colors.dim(`   Run: wb nginx-init ${serverInfo.id} to enable it`)
    );
  }

  console.log(colors.dim(""));
}

export async function runContainer(
  serverInfo: Server,
  interactive: boolean = false
): Promise<void> {
  const config = getConfig();
  if (!serverInfo.serverVersion) {
    throw new Error(
      `Server '${serverInfo.id}' must have a serverVersion specified`
    );
  }

  // Validate server setup first
  await validateServerSetup(serverInfo, config);
  //////////////////////
  //                  //
  //    Check dirs    //
  //                  //
  //////////////////////
  const instanceDirPath = join(
    config.mountPath,
    serverInfo.instanceDir || serverInfo.id
  );
  try {
    await Deno.lstat(instanceDirPath);
  } catch {
    throw new Error("Directories not ready for this server");
  }
  for await (const subDir of SUBDIRECTORIES) {
    const subDirPath = join(instanceDirPath, subDir);
    try {
      await Deno.lstat(subDirPath);
    } catch {
      throw new Error("Directories not ready for this server");
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
        colors.yellow(`⚠️  Warning: Could not create network: ${stderr.trim()}`)
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
  const postgresPort = getPostgresPort(serverInfo.port);
  const argsRunPostgres = [
    "run",
    "--rm",
    "-dt",
    "--name",
    `${serverInfo.id}-postgres`,
    "--network",
    serverInfo.id,
    "-p",
    `${postgresPort}:5432`,
    "-e",
    `POSTGRES_PASSWORD=${config.postgresPassword}`,
    "-e",
    `PGDATA=/var/lib/postgresql/data/pgdata`,
    "-v",
    `${join(instanceDirPath, "databases")}:/var/lib/postgresql/data`,
    "-v",
    `${join(instanceDirPath, "sandbox")}:/app/sandbox`,
    "postgres:17.4",
  ];
  // console.log("docker", argsRunPostgres.join(" "));
  const cmdRunPostgres = new Deno.Command("docker", {
    args: argsRunPostgres,
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

  /////////////////////////////////////
  //                                 //
  //    Remove existing container    //
  //                                 //
  /////////////////////////////////////
  const argsRemoveContainer = ["container", "rm", serverInfo.id];
  const cmdRemoveContainer = new Deno.Command("docker", {
    args: argsRemoveContainer,
  });
  const chdRemoveContainer = cmdRemoveContainer.spawn();
  await chdRemoveContainer.output();

  /////////////////////////
  //                     //
  //    Run container    //
  //                     //
  /////////////////////////
  const port = serverInfo.port;
  const argsRunContainer = [
    "run",
    // "--rm",
    ...(interactive ? ["-it"] : ["-dt"]),
    "--name",
    serverInfo.id,
    "--network",
    serverInfo.id,
    "-p",
    `${port}:8000`,
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    "-v",
    `${join(instanceDirPath, "databases")}:/app/databases`,
    "-v",
    `${join(instanceDirPath, "sandbox")}:/app/sandbox`,
    "-v",
    `${join(instanceDirPath, "assets")}:/app/assets`,
    "-e",
    `SANDBOX_DIR_PATH_EXTERNAL=${join(instanceDirPath, "sandbox")}`,
    ...(serverInfo.adminVersion
      ? ["-e", `ADMIN_SERVER_HOST=http://${serverInfo.id}-admin:8001`]
      : []),
    "-e",
    `SERVER_VERSION=${serverInfo.serverVersion || "latest"}`,
    ...(serverInfo.adminVersion
      ? ["-e", `ADMIN_VERSION=${serverInfo.adminVersion}`]
      : []),
    "-e",
    `DATABASE_FOLDER=${serverInfo.instanceDir || serverInfo.id}`,
    "-e",
    `CLERK_PUBLISHABLE_KEY=${config.clerkPublishableKey}`,
    "-e",
    `CLERK_SECRET_KEY=${config.clerkSecretKey}`,
    "-e",
    `INSTANCE_ID='${serverInfo.id}'`,
    "-e",
    `INSTANCE_NAME='${serverInfo.label}'`,
    ...(serverInfo.french ? ["-e", `INSTANCE_LANGUAGE=fr`] : []),
    ...(serverInfo.ethiopian ? ["-e", `INSTANCE_CALENDAR=ethiopian`] : []),
    ...(serverInfo.openAccess ? ["-e", `OPEN_ACCESS=1`] : []),
    "-e",
    `INSTANCE_REDIRECT_URL=https://${serverInfo.id}.${config.domain}`,
    "-e",
    `PG_HOST=${serverInfo.id}-postgres`,
    "-e",
    `PG_PORT=5432`,
    "-e",
    `ANTHROPIC_API_URL=${config.anthropicApiUrl}`,
    "-e",
    `ANTHROPIC_API_KEY=${config.anthropicApiKey}`,
    "-e",
    `PG_PASSWORD=${config.pgPassword}`,
    getServerImageName(serverInfo.serverVersion),
  ];

  function getServerImageName(version: string): string {
    const [major, minor] = version.split(".").map(Number);
    const isNewVersion = major > 1 || (major === 1 && minor >= 6);
    const imageFamily = isNewVersion ? "wb-fastr-server" : "wb-hmis-server";
    return `timroberton/comb:${imageFamily}-v${version}`;
  }
  const cmdRunContainer = new Deno.Command("docker", {
    args: argsRunContainer,
  });
  const chdRunContainer = cmdRunContainer.spawn();
  await chdRunContainer.output();
}
