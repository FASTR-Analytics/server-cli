import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";

export async function handleConfigValidate(filePath: string): Promise<void> {
  const store = new ServerStore(filePath);
  
  try {
    const { servers, errors } = await store.validate();
    
    if (errors.size === 0) {
      console.log(colors.green(`✓ servers.json is valid`));
      console.log(colors.dim(`  Found ${servers.length} server(s)`));
      return;
    }

    console.log(colors.red(`✗ Found validation errors:`));
    console.log();

    for (const [serverId, serverErrors] of errors.entries()) {
      console.log(colors.yellow(`${serverId}:`));
      for (const error of serverErrors) {
        console.log(colors.red(`  • ${error}`));
      }
      console.log();
    }

    Deno.exit(1);
  } catch (error) {
    console.error(colors.red(`Error reading servers.json: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}