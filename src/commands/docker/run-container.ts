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
  config: Config,
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
            `✗ Nginx port mismatch: config has ${nginxPort}, server uses ${port}`,
          ),
        );
        console.log(
          colors.dim(`   Run: wb nginx ${serverInfo.id} to fix configuration`),
        );
        throw new Error(
          `Nginx configuration port mismatch for ${serverInfo.id}`,
        );
      }
    } else {
      console.log(
        colors.yellow(`⚠️  Warning: Cannot parse port from nginx config`),
      );
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(
        colors.yellow(
          `⚠️  Warning: No nginx configuration found for ${subdomain}`,
        ),
      );
      console.log(
        colors.dim(`   Run: wb nginx ${serverInfo.id} to create one`),
      );
    } else if (
      error instanceof Error &&
      error.message?.includes("port mismatch")
    ) {
      throw error; // Re-throw port mismatch errors to stop container startup
    } else {
      console.log(
        colors.yellow(`⚠️  Warning: Cannot check nginx configuration`),
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
            `⚠️  Warning: No SSL certificate found for ${subdomain}`,
          ),
        );
        console.log(
          colors.dim(`   Run: wb ssl-init ${serverInfo.id} to create one`),
        );
      } else {
        console.log(colors.green(`✓ SSL certificate found for ${subdomain}`));
      }
    } else {
      console.log(
        colors.yellow(
          `⚠️  Warning: Cannot check SSL certificates (certbot not available)`,
        ),
      );
    }
  } catch {
    console.log(
      colors.yellow(
        `⚠️  Warning: Cannot check SSL certificates (certbot not available)`,
      ),
    );
  }

  // Check nginx is enabled
  const nginxEnabledPath = join(config.sitesEnabledPath, subdomain);
  try {
    await Deno.lstat(nginxEnabledPath);
    console.log(colors.green(`✓ Nginx site enabled for ${subdomain}`));
  } catch {
    console.log(
      colors.yellow(`⚠️  Warning: Nginx site not enabled for ${subdomain}`),
    );
    console.log(
      colors.dim(`   Run: wb nginx-init ${serverInfo.id} to enable it`),
    );
  }

  console.log(colors.dim(""));
}

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

  // Validate server setup first
  await validateServerSetup(serverInfo, config);
  //////////////////////
  //                  //
  //    Check dirs    //
  //                  //
  //////////////////////
  const instanceDirPath = join(
    config.mountPath,
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

  // Save last 200 lines of logs if the previous postgres container crashed (non-zero exit code)
  const inspectPrevPostgresCmd = new Deno.Command("docker", {
    args: ["inspect", "--format", "{{.State.ExitCode}}", `${serverInfo.id}-postgres`],
    stdout: "piped",
    stderr: "piped",
  });
  const inspectPrevPostgresResult = await inspectPrevPostgresCmd.output();
  if (inspectPrevPostgresResult.success) {
    const exitCode = parseInt(new TextDecoder().decode(inspectPrevPostgresResult.stdout).trim(), 10);
    if (exitCode !== 0) {
      const logsDir = join(instanceDirPath, "logs");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = join(logsDir, `${timestamp}-postgres-crashed-exit${exitCode}.log`);
      const saveLogsCmd = new Deno.Command("docker", {
        args: ["logs", "--timestamps", "--tail", "200", `${serverInfo.id}-postgres`],
        stdout: "piped",
        stderr: "piped",
      });
      const saveLogsResult = await saveLogsCmd.output();
      const logContent =
        new TextDecoder().decode(saveLogsResult.stdout) +
        new TextDecoder().decode(saveLogsResult.stderr);
      if (logContent.trim()) {
        await Deno.writeTextFile(logFile, logContent);
        console.log(colors.yellow(`⚠️  Postgres container crashed (exit ${exitCode}) — logs saved to logs/${timestamp}-postgres-crashed-exit${exitCode}.log`));
        await sendCrashAlert(config.sendGridApi, `${serverInfo.id}-postgres`, exitCode, logContent);
      }
    }
  }

  const argsRemovePostgresContainer = ["container", "rm", `${serverInfo.id}-postgres`];
  const cmdRemovePostgresContainer = new Deno.Command("docker", {
    args: argsRemovePostgresContainer,
  });
  const chdRemovePostgresContainer = cmdRemovePostgresContainer.spawn();
  await chdRemovePostgresContainer.output();

  const postgresPort = getPostgresPort(serverInfo.port);
  const argsRunPostgres = [
    "run",
    // "--rm",
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

  ////////////////////////
  //                    //
  //    Run Valkey      //
  //                    //
  ////////////////////////
  const argsRunValkey = [
    "run",
    "--rm",
    "-dt",
    "--name",
    `${serverInfo.id}-valkey`,
    "--network",
    serverInfo.id,
    "-v",
    `${join(instanceDirPath, "valkey")}:/data`,
    "valkey/valkey:8.0",
    "valkey-server",
    "--appendonly",
    "yes",
  ];
  const cmdRunValkey = new Deno.Command("docker", { args: argsRunValkey });
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

  // Save last 200 lines of logs if the previous container crashed (non-zero exit code)
  const inspectPrevCmd = new Deno.Command("docker", {
    args: ["inspect", "--format", "{{.State.ExitCode}}", serverInfo.id],
    stdout: "piped",
    stderr: "piped",
  });
  const inspectPrevResult = await inspectPrevCmd.output();
  if (inspectPrevResult.success) {
    const exitCode = parseInt(new TextDecoder().decode(inspectPrevResult.stdout).trim(), 10);
    if (exitCode !== 0) {
      const logsDir = join(instanceDirPath, "logs");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = join(logsDir, `${timestamp}-crashed-exit${exitCode}.log`);
      const saveLogsCmd = new Deno.Command("docker", {
        args: ["logs", "--timestamps", "--tail", "200", serverInfo.id],
        stdout: "piped",
        stderr: "piped",
      });
      const saveLogsResult = await saveLogsCmd.output();
      const logContent =
        new TextDecoder().decode(saveLogsResult.stdout) +
        new TextDecoder().decode(saveLogsResult.stderr);
      if (logContent.trim()) {
        await Deno.writeTextFile(logFile, logContent);
        console.log(colors.yellow(`⚠️  Container crashed (exit ${exitCode}) — logs saved to logs/${timestamp}-crashed-exit${exitCode}.log`));
        await sendCrashAlert(config.sendGridApi, serverInfo.id, exitCode, logContent);
      }
    }
  }

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
    `STATUS_API_KEY=${config.statusApiKey}`,
    "-e",
    `SEND_GRID_API=${config.sendGridApi}`,
    "-e",
    `PG_PASSWORD=${config.pgPassword}`,
    "-e",
    `VALKEY_URL=redis://${serverInfo.id}-valkey:6379`,
    getServerImageName(serverInfo.serverVersion),
  ];

  function getServerImageName(version: string): string {
    const [major, minor] = version.split(".").map(Number);
    const isOldVersion = major === 1 && minor < 6;
    const imageFamily = isOldVersion ? "wb-hmis-server" : "wb-fastr-server";
    return `timroberton/comb:${imageFamily}-v${version}`;
  }
  const cmdRunContainer = new Deno.Command("docker", {
    args: argsRunContainer,
  });
  const chdRunContainer = cmdRunContainer.spawn();
  await chdRunContainer.output();

  // If pgAdmin is running, connect it to this server's network so it can
  // reach the newly started postgres container.
  await connectPgAdminToNetwork(serverInfo.id);
}

async function sendCrashAlert(
  sendGridApi: string,
  containerId: string,
  exitCode: number,
  logTail: string,
): Promise<void> {
  const recipients = ["nick@usefuldata.com.au", "timroberton@gmail.com"];
  const subject = `Container crashed: ${containerId} (exit ${exitCode})`;
  const plainText = `Container ${containerId} crashed with exit code ${exitCode}.\n\nLast logs:\n\n${logTail}`;
  const html = `<p>Container <strong>${containerId}</strong> crashed with exit code <strong>${exitCode}</strong>.</p><pre style="background:#f4f4f4;padding:12px;font-size:12px">${logTail.replace(/</g, "&lt;")}</pre>`;

  for (const to of recipients) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendGridApi}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: "noreply@fastr-analytics.org", name: "FASTR Analytics Platform" },
        subject,
        content: [
          { type: "text/plain", value: plainText },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      console.error(`SendGrid error for ${to}: ${res.status} ${error}`);
    }
  }
}

async function connectPgAdminToNetwork(networkId: string): Promise<void> {
  const inspectCmd = new Deno.Command("docker", {
    args: ["inspect", "--format", "{{.State.Running}}", "pgadmin"],
    stdout: "piped",
    stderr: "piped",
  });
  const inspectResult = await inspectCmd.output();
  const isRunning =
    new TextDecoder().decode(inspectResult.stdout).trim() === "true";
  if (!isRunning) return;

  const connectCmd = new Deno.Command("docker", {
    args: ["network", "connect", networkId, "pgadmin"],
    stdout: "piped",
    stderr: "piped",
  });
  await connectCmd.output();
}
