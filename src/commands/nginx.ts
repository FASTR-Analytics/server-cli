import { join } from "@std/path";
import { ServerStore } from "../core/server-store.ts";
import { colors } from "../utils/colors.ts";

export async function handleInitNginx(
  filePath: string,
  serverId: string,
  domain: string,
  sitesAvailablePath: string,
  sitesEnabledPath: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    console.error(colors.dim("Please add the server first using: wb config add <id>"));
    Deno.exit(1);
  }

  const subdomain = `${serverId}.${domain}`;
  const port = server.port;
  const nginxFileText = `server {
  listen 80;
  server_name ${subdomain};
  location / {
    proxy_pass http://localhost:${port};
    proxy_buffering off;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
`;

  console.log(colors.cyan(`Setting up nginx for ${serverId}...`));
  console.log(colors.dim(`Domain: ${subdomain}`));

  const nginxFilePath = join(sitesAvailablePath, subdomain);
  
  try {
    await Deno.lstat(nginxFilePath);
    console.log(colors.yellow(`✓ Nginx config already exists`));
  } catch {
    await Deno.writeTextFile(nginxFilePath, nginxFileText);
    console.log(colors.green(`✓ Created nginx config`));
  }

  const nginxSymlinkPath = join(sitesEnabledPath, subdomain);
  
  try {
    await Deno.lstat(nginxSymlinkPath);
    await Deno.remove(nginxSymlinkPath);
    console.log(colors.yellow(`✓ Removed existing symlink`));
  } catch {
    // Symlink doesn't exist
  }
  
  await Deno.symlink(nginxFilePath, nginxSymlinkPath);
  console.log(colors.green(`✓ Created symlink in sites-enabled`));

  console.log(colors.cyan(`\nRestarting nginx...`));
  const cmd = new Deno.Command("service", {
    args: ["nginx", "restart"],
  });
  const child = cmd.spawn();
  const output = await child.output();
  
  if (!output.success) {
    console.error(colors.red("Failed to restart nginx"));
    console.error(colors.dim("You may need to restart nginx manually: sudo service nginx restart"));
  } else {
    console.log(colors.green(`✓ Nginx restarted successfully`));
  }
  
  console.log(colors.green(`\n✓ Nginx setup complete for ${serverId}`));
  console.log(colors.dim(`Site will be available at: http://${subdomain}`));
}

export async function handleRemoveNginx(
  filePath: string,
  serverId: string,
  domain: string,
  sitesAvailablePath: string,
  sitesEnabledPath: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    Deno.exit(1);
  }

  const subdomain = `${serverId}.${domain}`;
  
  console.log(colors.cyan(`Removing nginx configuration for ${serverId}...`));
  console.log(colors.dim(`Domain: ${subdomain}`));

  const nginxSymlinkPath = join(sitesEnabledPath, subdomain);
  try {
    await Deno.remove(nginxSymlinkPath);
    console.log(colors.green(`✓ Removed symlink from sites-enabled`));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(colors.yellow(`Warning: Could not remove symlink: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  const nginxFilePath = join(sitesAvailablePath, subdomain);
  try {
    await Deno.remove(nginxFilePath);
    console.log(colors.green(`✓ Removed nginx config from sites-available`));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(colors.yellow(`Nginx config does not exist`));
    } else {
      console.error(colors.red(`Error removing nginx config: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  console.log(colors.cyan(`\nRestarting nginx...`));
  const cmd = new Deno.Command("service", {
    args: ["nginx", "restart"],
  });
  const child = cmd.spawn();
  const output = await child.output();
  
  if (!output.success) {
    console.error(colors.red("Failed to restart nginx"));
    console.error(colors.dim("You may need to restart nginx manually: sudo service nginx restart"));
  } else {
    console.log(colors.green(`✓ Nginx restarted successfully`));
  }
  
  console.log(colors.green(`\n✓ Nginx removal complete for ${serverId}`));
}