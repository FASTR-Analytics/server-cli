export async function stopContainer(id: string, timeoutSeconds?: number): Promise<void> {
  const args = ["stop"];
  if (timeoutSeconds !== undefined) {
    args.push("-t", String(timeoutSeconds));
  }
  args.push(id);

  const cmd = new Deno.Command("docker", {
    args,
  });
  const chd = cmd.spawn();
  await chd.output();
}
