export async function connectPgAdminToNetwork(networkId: string): Promise<void> {
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
