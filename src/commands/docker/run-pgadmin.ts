import { join } from "@std/path/join";
import { getConfig } from "../../core/config.ts";
import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";

const PGADMIN_CONTAINER_NAME = "pgadmin";
const PGADMIN_PORT = 5050;

export async function handleRunPgAdmin(): Promise<void> {
  const config = getConfig();
  const store = new ServerStore(config.serversFilePath);
  const servers = await store.read();

  if (servers.length === 0) {
    console.log(colors.yellow("No servers configured in servers.json"));
    return;
  }

  // Create pgadmin config directory
  const pgadminDir = join(config.mountPath, "pgadmin");
  await Deno.mkdir(pgadminDir, { recursive: true });

  // Generate pgAdmin servers.json
  const pgAdminServers: Record<string, unknown> = {};
  servers.forEach((server, index) => {
    pgAdminServers[String(index + 1)] = {
      Name: server.label,
      Group: "Servers",
      Host: `${server.id}-postgres`,
      Port: 5432,
      MaintenanceDB: "postgres",
      Username: "postgres",
      SSLMode: "prefer",
      PassFile: "/pgadmin4/pgpass",
    };
  });

  const serversJsonPath = join(pgadminDir, "servers.json");
  await Deno.writeTextFile(
    serversJsonPath,
    JSON.stringify({ Servers: pgAdminServers }, null, 2),
  );
  console.log(
    colors.green(`✓ Generated servers.json (${servers.length} servers)`),
  );

  // Generate pgpass file: hostname:port:database:username:password
  // Uses postgresPassword (POSTGRES_PASSWORD) — the value used to initialise
  // each postgres container, which is what direct connections must authenticate with.
  const pgpassLines = servers.map(
    (s) => `${s.id}-postgres:5432:*:postgres:${config.postgresPassword}`,
  );
  const pgpassPath = join(pgadminDir, "pgpass");
  await Deno.writeTextFile(pgpassPath, pgpassLines.join("\n") + "\n");
  await Deno.chmod(pgpassPath, 0o600);
  console.log(colors.green("✓ Generated pgpass file"));

  // Stop and remove any existing pgAdmin container
  console.log(colors.cyan("Removing existing pgAdmin container (if any)..."));
  const stopCmd = new Deno.Command("docker", {
    args: ["stop", PGADMIN_CONTAINER_NAME],
    stdout: "piped",
    stderr: "piped",
  });
  await stopCmd.output();

  const removeCmd = new Deno.Command("docker", {
    args: ["container", "rm", PGADMIN_CONTAINER_NAME],
    stdout: "piped",
    stderr: "piped",
  });
  await removeCmd.output();

  // Run pgAdmin container
  // --user root: required so libpq can read the 0600 pgpass file
  // SERVER_MODE=False: disables login screen (safe since access is SSH-tunnelled only)
  console.log(colors.cyan("Starting pgAdmin container..."));
  const runArgs = [
    "run",
    "-dt",
    "--name",
    PGADMIN_CONTAINER_NAME,
    "--user",
    "root",
    "-p",
    `127.0.0.1:${PGADMIN_PORT}:80`,
    "-e",
    "PGADMIN_DEFAULT_EMAIL=admin@admin.com",
    "-e",
    "PGADMIN_DEFAULT_PASSWORD=admin",
    "-e",
    "PGADMIN_CONFIG_SERVER_MODE=False",
    "-e",
    "PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED=False",
    "-e",
    "PGADMIN_SERVER_JSON_FILE=/pgadmin4/servers.json",
    "-v",
    `${serversJsonPath}:/pgadmin4/servers.json:ro`,
    "-v",
    `${pgpassPath}:/pgadmin4/pgpass:ro`,
    "--restart",
    "unless-stopped",
    "dpage/pgadmin4",
  ];

  const runCmd = new Deno.Command("docker", {
    args: runArgs,
    stdout: "piped",
    stderr: "piped",
  });
  const runResult = await runCmd.output();

  if (!runResult.success) {
    const err = new TextDecoder().decode(runResult.stderr);
    throw new Error(`Failed to start pgAdmin: ${err}`);
  }
  console.log(colors.green("✓ pgAdmin container started"));

  // Connect pgAdmin to each server's Docker network
  console.log(colors.cyan("Connecting pgAdmin to server networks..."));
  let connected = 0;
  for (const server of servers) {
    const connectCmd = new Deno.Command("docker", {
      args: ["network", "connect", server.id, PGADMIN_CONTAINER_NAME],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await connectCmd.output();
    const stderr = new TextDecoder().decode(result.stderr);
    if (result.success || stderr.includes("already exists")) {
      connected++;
    } else {
      console.log(
        colors.yellow(
          `  ⚠ Could not connect to network '${server.id}': ${stderr.trim()}`,
        ),
      );
    }
  }
  console.log(
    colors.green(`✓ Connected to ${connected}/${servers.length} networks`),
  );

  console.log("");
  console.log(
    colors.bold(`pgAdmin running at: http://127.0.0.1:${PGADMIN_PORT}`),
  );
  console.log(
    colors.dim(
      "Access via SSH tunnel: ssh -L 5050:localhost:5050 user@your-droplet",
    ),
  );
}
