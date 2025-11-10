import { colors } from "../../utils/colors.ts";

export async function handlePrune(): Promise<void> {
  console.log(colors.cyan("Pruning unused Docker resources..."));

  const cmd = new Deno.Command("docker", {
    args: ["network", "prune", "-f"],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);

  if (output.success) {
    console.log(colors.green("✓ Docker networks pruned"));
    if (stdout.trim()) {
      console.log(colors.dim(stdout.trim()));
    }
  } else {
    console.error(colors.red("Error pruning Docker networks"));
    if (stderr.trim()) {
      console.error(colors.red(stderr.trim()));
    }
    Deno.exit(1);
  }
}
