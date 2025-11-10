import { runCLI } from "./src/core/cli.ts";
import { getConfig } from "./src/core/config.ts";
import { colors } from "./src/utils/colors.ts";

// Validate config on startup
try {
  getConfig();
} catch {
  console.error(colors.red("Error: Missing required environment variables"));
  console.error(
    colors.dim(
      "Required: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, DOMAIN, SERVERS_FILE_PATH, MOUNT_PATH, SITES_AVAILABLE_PATH, SITES_ENABLED_PATH, POSTGRES_PASSWORD, ANTHROPIC_API_URL, ANTHROPIC_API_KEY, PG_PASSWORD"
    )
  );
  Deno.exit(1);
}

// Run CLI
if (import.meta.main) {
  await runCLI();
}
