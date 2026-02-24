import { colors } from "../../utils/colors.ts";

const PGADMIN_CONTAINER_NAME = "pgadmin";

export async function handleStopPgAdmin(): Promise<void> {
  console.log(colors.cyan("Stopping pgAdmin container..."));

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

  console.log(colors.green("✓ pgAdmin stopped"));
}
