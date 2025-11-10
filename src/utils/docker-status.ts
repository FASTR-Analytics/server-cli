export async function getRunningContainers(): Promise<Set<string>> {
  try {
    const cmd = new Deno.Command("docker", {
      args: ["ps", "--format", "{{.Names}}"],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();

    if (!output.success) {
      return new Set();
    }

    const containerNames = new TextDecoder()
      .decode(output.stdout)
      .trim()
      .split("\n")
      .filter((name) => name.length > 0);

    return new Set(containerNames);
  } catch {
    return new Set();
  }
}
