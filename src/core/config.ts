export interface Config {
  clerkPublishableKey: string;
  clerkSecretKey: string;
  domain: string;
  serversFilePath: string;
  mountPath: string;
  sitesAvailablePath: string;
  sitesEnabledPath: string;
  postgresPassword: string;
  anthropicApiUrl: string;
  anthropicApiKey: string;
  pgPassword: string;
}

let config: Config | null = null;

export function getConfig(): Config {
  if (config) {
    return config;
  }

  const clerkPublishableKey = Deno.env.get("CLERK_PUBLISHABLE_KEY");
  const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY");
  const domain = Deno.env.get("DOMAIN");
  const serversFilePath = Deno.env.get("SERVERS_FILE_PATH");
  const mountPath = Deno.env.get("MOUNT_PATH");
  const sitesAvailablePath = Deno.env.get("SITES_AVAILABLE_PATH");
  const sitesEnabledPath = Deno.env.get("SITES_ENABLED_PATH");
  const postgresPassword = Deno.env.get("POSTGRES_PASSWORD");
  const anthropicApiUrl = Deno.env.get("ANTHROPIC_API_URL");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const pgPassword = Deno.env.get("PG_PASSWORD");

  if (
    !clerkPublishableKey ||
    !clerkSecretKey ||
    !domain ||
    !serversFilePath ||
    !mountPath ||
    !sitesAvailablePath ||
    !sitesEnabledPath ||
    !postgresPassword ||
    !anthropicApiUrl ||
    !anthropicApiKey ||
    !pgPassword
  ) {
    throw new Error(
      "Missing required environment variables: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, DOMAIN, SERVERS_FILE_PATH, MOUNT_PATH, SITES_AVAILABLE_PATH, SITES_ENABLED_PATH, POSTGRES_PASSWORD, ANTHROPIC_API_URL, ANTHROPIC_API_KEY, PG_PASSWORD"
    );
  }

  config = {
    clerkPublishableKey,
    clerkSecretKey,
    domain,
    serversFilePath,
    mountPath,
    sitesAvailablePath,
    sitesEnabledPath,
    postgresPassword,
    anthropicApiUrl,
    anthropicApiKey,
    pgPassword,
  };

  return config;
}