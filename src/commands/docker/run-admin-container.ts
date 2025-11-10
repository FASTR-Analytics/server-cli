import { Server } from "../../core/types.ts";

export async function runAdminContainer(serverInfo: Server): Promise<void> {
  // Skip if no adminVersion is specified
  if (!serverInfo.adminVersion) {
    return;
  }

  // Remove existing admin container if it exists
  try {
    const removeCmd = new Deno.Command("docker", {
      args: ["container", "rm", `${serverInfo.id}-admin`],
    });
    const removeProcess = removeCmd.spawn();
    await removeProcess.output();
  } catch {
    // Container might not exist yet
  }

  // Determine admin image to use
  const adminImage = `timroberton/comb:wb-hmis-server-admin-v${serverInfo.adminVersion}`;

  // Run admin container
  const runArgs = [
    "run",
    "--rm",
    "-dt",
    "--name",
    `${serverInfo.id}-admin`,
    "--network",
    serverInfo.id,
    "-e",
    `ADMIN_VERSION=${serverInfo.adminVersion}`,
    adminImage,
  ];

  const runCmd = new Deno.Command("docker", { args: runArgs });
  const runProcess = runCmd.spawn();
  const result = await runProcess.output();

  if (!result.success) {
    const error = new TextDecoder().decode(result.stderr);
    throw new Error(`Failed to start admin container: ${error}`);
  }
}
