export async function stopAdminContainer(serverId: string): Promise<void> {
  try {
    const stopCmd = new Deno.Command("docker", {
      args: ["stop", `${serverId}-admin`],
    });
    const stopProcess = stopCmd.spawn();
    await stopProcess.output();
  } catch {
    // Container might not be running
  }

  try {
    const removeCmd = new Deno.Command("docker", {
      args: ["container", "rm", `${serverId}-admin`],
    });
    const removeProcess = removeCmd.spawn();
    await removeProcess.output();
  } catch {
    // Container might not exist
  }
}
